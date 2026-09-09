/**
 * Motion audit.
 *
 * Most of motion is judgement, and a runner has no opinion about whether 180ms
 * feels right. But three things are not judgement at all:
 *
 *   1. A curve can be on the wrong side of the diagonal. `ease-in` on an
 *      entrance is a real, specific defect — the object creeps in and then
 *      arrives at speed — and it is invisible in a diff because the two curves
 *      look equally plausible as four numbers.
 *   2. An exit can be slower than its entrance. Also invisible in a diff, also
 *      wrong every time.
 *   3. Reduced motion can quietly stop being honoured. This is the one that
 *      matters most and the one nobody notices breaking, because the people it
 *      breaks for are not the people editing the file.
 *
 *   node scripts/audit-motion.mjs
 */
import { readFileSync } from "node:fs"

const CSS = readFileSync(new URL("../src/motion.css", import.meta.url), "utf8")

/* Past roughly this, a transition stops reading as motion and starts reading
   as latency — the interface hesitating rather than responding. */
const MAX_DURATION = 400
/* An exit should be about 0.7x its entrance: fast enough to get out of the
   way, slow enough to show where the thing went. */
const EXIT_RATIO = [0.6, 0.8]

const curveReport = []
const failures = []
const fail = (label, detail) => failures.push({ label, detail })
let checked = 0

/** Declarations from the first :root block — the un-reduced values. */
const root = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("\n}", CSS.indexOf(":root {")))
const ms = (name) => {
  const m = root.match(new RegExp(`--${name}:\\s*(\\d+)ms`))
  if (!m) throw new Error(`no --${name} in :root`)
  return Number(m[1])
}

const LADDER = ["motion-instant", "motion-quick", "motion-base", "motion-slow"]

let previous = -1
for (const name of LADDER) {
  const value = ms(name)
  checked++
  if (value > MAX_DURATION) fail(name, `${value}ms reads as latency, ceiling is ${MAX_DURATION}ms`)
  if (value <= previous) fail(name, `${value}ms does not exceed the rung below it (${previous}ms)`)
  previous = value
}
/* Instant has to be genuinely instant. A 30ms "snap" is the worst of both:
   too slow to feel mechanical, too fast to read as motion. */
checked++
if (ms("motion-instant") !== 0) fail("motion-instant", `is ${ms("motion-instant")}ms, must be 0`)

for (const pair of ["base", "slow"]) {
  const enter = ms(`motion-${pair}`)
  const exit = ms(`motion-${pair}-exit`)
  const ratio = exit / enter
  checked++
  if (exit >= enter) fail(`motion-${pair}-exit`, `${exit}ms is not faster than its entrance (${enter}ms)`)
  else if (ratio < EXIT_RATIO[0] || ratio > EXIT_RATIO[1])
    fail(`motion-${pair}-exit`, `ratio ${ratio.toFixed(2)} outside ${EXIT_RATIO.join("–")}`)
}

/* ── Curves ────────────────────────────────────────────────────────────────
   A cubic-bezier is judged two ways, and the first version of this audit only
   did the first.

   WHICH SIDE OF THE DIAGONAL. Above it is deceleration (fast start, gentle
   finish — arriving); below is acceleration (gentle start, fast finish —
   leaving). Sampled across the curve rather than read off the control points,
   because control points can satisfy an inequality while the curve itself
   misbehaves between them.

   HOW MUCH DEAD TIME. This is the one that was missing. cubic-bezier(0.7, 0,
   0.84, 0) accelerates perfectly correctly and is 2.8% done at the halfway
   point — an exit on that curve hangs motionless for half its duration and
   then disappears. It passed a control-point check and felt broken. Nothing
   may spend half its duration doing less than 15% of the work. */
const MIN_MIDPOINT = 0.15

/** y at a given x, by bisection on the parametric form. */
const at = ([x1, y1, x2, y2]) => (x) => {
  const cx = (s) => 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s ** 2 * x2 + s ** 3
  const cy = (s) => 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s ** 2 * y2 + s ** 3
  let lo = 0
  let hi = 1
  let s = x
  for (let i = 0; i < 50; i++) {
    s = (lo + hi) / 2
    if (cx(s) < x) lo = s
    else hi = s
  }
  return cy(s)
}

const SAMPLES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
const EPSILON = 0.01

const CURVES = {
  "ease-out": (y) =>
    SAMPLES.every((x) => y(x) >= x - EPSILON)
      ? null
      : "dips below the diagonal — that is acceleration, wrong for something arriving",
  "ease-in": (y) =>
    SAMPLES.every((x) => y(x) <= x + EPSILON)
      ? null
      : "rises above the diagonal — that is deceleration, wrong for something leaving",
  "ease-in-out": (y) =>
    y(0.25) < 0.25 && y(0.75) > 0.75
      ? null
      : "is not an S-curve — should accelerate away, then settle",
}

for (const [name, judge] of Object.entries(CURVES)) {
  const m = CSS.match(new RegExp(`--${name}:\\s*cubic-bezier\\(([^)]+)\\)`))
  checked++
  if (!m) {
    fail(name, "missing")
    continue
  }
  const points = m[1].split(",").map((n) => Number(n.trim()))
  if (points.length !== 4 || points.some(Number.isNaN)) {
    fail(name, `unparseable: ${m[1]}`)
    continue
  }
  /* CSS requires the x control points in [0,1]; outside it the declaration is
     invalid and silently dropped, which looks exactly like a missing class. */
  if (points[0] < 0 || points[0] > 1 || points[2] < 0 || points[2] > 1)
    fail(name, "x control point outside [0,1] — CSS drops the declaration silently")

  const y = at(points)
  const verdict = judge(y)
  if (verdict) fail(name, verdict)

  checked++
  const midpoint = y(0.5)
  if (midpoint < MIN_MIDPOINT)
    fail(name, `only ${(midpoint * 100).toFixed(1)}% done at halfway — dead time reads as sluggish`)
  curveReport.push(`${name} ${(midpoint * 100).toFixed(0)}% at halfway`)
}

/* ── Reduced motion ───────────────────────────────────────────────────────
   Checked hardest, because it is the rule with a person behind it and the one
   whose breakage nobody editing this file would ever notice. */
const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"))
checked++
if (!CSS.includes("@media (prefers-reduced-motion: reduce)")) {
  fail("reduced-motion", "no block at all")
} else {
  /* It must be blanket. Neutralising only the tokens leaves every Tailwind
     duration utility and every keyframe animation running. */
  for (const [what, pattern] of [
    ["universal selector", /\*,\s*\n?\s*\*::before,\s*\n?\s*\*::after/],
    ["transition-duration", /transition-duration:\s*[\d.]+m?s\s*!important/],
    ["animation-duration", /animation-duration:\s*[\d.]+m?s\s*!important/],
    ["animation-iteration-count", /animation-iteration-count:\s*1\s*!important/],
  ]) {
    checked++
    if (!pattern.test(reduced)) fail("reduced-motion", `does not neutralise ${what}`)
  }
  /* Every token must be overridden too, so anything reading them directly
     rather than through a utility is covered as well. */
  for (const name of [...LADDER.slice(1), "motion-base-exit", "motion-slow-exit"]) {
    checked++
    if (!new RegExp(`--${name}:\\s*1ms`).test(reduced))
      fail("reduced-motion", `--${name} is not neutralised`)
  }
}

console.log(
  `curves ${curveReport.join(", ")}\n` +
  `ladder ${LADDER.map((n) => `${n.replace("motion-", "")} ${ms(n)}ms`).join(", ")}` +
    `\nexits  base ${ms("motion-base-exit")}ms (${(ms("motion-base-exit") / ms("motion-base")).toFixed(2)}x), ` +
    `slow ${ms("motion-slow-exit")}ms (${(ms("motion-slow-exit") / ms("motion-slow")).toFixed(2)}x)`
)
console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.label.padEnd(22)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — curves face the right way, exits beat entrances, reduced motion is honoured\n")
