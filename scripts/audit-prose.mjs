/**
 * Prose audit.
 *
 * Prose has fewer hard rules than colour does, but the ones it has are real
 * and each has a person behind it or a measurable failure mode:
 *
 *   measure    past ~90 characters the eye loses the return sweep. This is a
 *              reading-comprehension property, not a taste one.
 *   rhythm     lead > flow > bind. A heading with equal space above and below
 *              detaches from its own section — the same proximity argument the
 *              spacing ladder makes, and just as checkable.
 *   links      colour AND underline. Colour alone fails WCAG 1.4.1 for anyone
 *              who cannot distinguish it, so the underline is not decoration.
 *   grounds    inline code puts text on a TINT, and colour-roles rule 5 says a
 *              tint carries no contrast guarantee. Gray has enormous headroom
 *              here, but "enormous" is a measurement, not an assumption.
 *
 *   node scripts/audit-prose.mjs
 */
import { readFileSync } from "node:fs"
import { srgb, composite, luminanceOf, contrast } from "./generate-scales.mjs"
import { readCss } from "./sources.mjs"

const read = (f) => readCss(f.replace(/\.css$/, ""))
const PROSE = read("prose.css")
const FILES = ["ramps.css", "semantic.css", "depth.css", "state.css", "prose.css"]

const declarations = (css, selector) => {
  const start = css.indexOf(selector)
  if (start === -1) return {}
  const body = css.slice(start, css.indexOf("\n}", start))
  const out = {}
  for (const [, k, v] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[k] = v.trim()
  return out
}
const scope = (mode) => {
  const merged = {}
  for (const f of FILES) {
    Object.assign(merged, declarations(read(f), ":root {"))
    Object.assign(merged, declarations(read(f), ':root[data-theme="minima"] {'))
  }
  if (mode === "dark")
    for (const f of FILES) Object.assign(merged, declarations(read(f), ':root[data-theme="minima"].dark {'))
  return merged
}
const resolve = (vars, v, d = 0) => {
  if (d > 12) throw new Error(`var cycle at ${v}`)
  const m = v?.match(/^var\(--([\w-]+)\)$/)
  return m ? resolve(vars, vars[m[1]], d + 1) : v
}
const parseOklch = (css) => {
  if (!/^oklch\(/.test(css)) throw new Error(`not a literal colour: ${css}`)
  const [L, C, H] = css.slice(6, -1).split(/\s+/).map(Number)
  if ([L, C].some(Number.isNaN)) throw new Error(`unparseable: ${css}`)
  return srgb(L, C, H || 0)
}
const parseAlpha = (css) => {
  const m = css.match(/^rgb\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)%\)$/)
  if (!m) throw new Error(`unparseable alpha: ${css}`)
  return { rgb: m.slice(1, 4).map((n) => Number(n) / 255), a: Number(m[4]) / 100 }
}

const failures = []
const fail = (label, detail) => failures.push({ label, detail })
let checked = 0

/* ── Measure ─────────────────────────────────────────────────────────────── */
const measure = Number((PROSE.match(/--measure:\s*(\d+)ch/) ?? [])[1])
checked++
if (!Number.isFinite(measure)) fail("--measure", "missing or not in ch units")
else if (measure < 45 || measure > 90) fail("--measure", `${measure}ch is outside the readable band 45–90`)

/* ── Rhythm ──────────────────────────────────────────────────────────────── */
const em = (name) => Number((PROSE.match(new RegExp(`--prose-${name}:\\s*([\\d.]+)em`)) ?? [])[1])
const lead = em("lead")
const flow = em("flow")
const bind = em("bind")
checked += 2
if (![lead, flow, bind].every(Number.isFinite)) fail("rhythm", "one of lead/flow/bind is missing or not in em")
else {
  if (!(lead > flow)) fail("rhythm", `lead ${lead}em must exceed flow ${flow}em — a heading needs more room above than between blocks`)
  if (!(flow > bind)) fail("rhythm", `flow ${flow}em must exceed bind ${bind}em — a heading must sit closer to what it introduces`)
}

/* ── Links carry more than colour ────────────────────────────────────────── */
const linkRule = PROSE.slice(PROSE.indexOf(".prose a {"), PROSE.indexOf("}", PROSE.indexOf(".prose a {")))
checked++
if (!/text-decoration:\s*underline/.test(linkRule))
  fail(".prose a", "has no underline — colour alone fails WCAG 1.4.1")

/* ── Grounds, and the hierarchy ──────────────────────────────────────────
   Colours are READ from prose.css rather than named here. The point of the
   body/heading split is that the two differ, so a check that assumed which
   token each one used could not notice if they stopped differing. */
const ruleFor = (selector) => {
  const at = PROSE.indexOf(selector)
  if (at === -1) throw new Error(`no rule for ${selector} — the check cannot run`)
  const body = PROSE.slice(at, PROSE.indexOf("}", at))
  const m = body.match(/(?:^|[\s;{])color:\s*var\(--([\w-]+)/m)
  if (!m) throw new Error(`${selector} declares no colour — the check cannot run`)
  return m[1]
}
const bodyToken = ruleFor(".prose {")
const headingToken = ruleFor(".prose :is(h1, h2, h3, h4) {")
const linkToken = ruleFor(".prose a {")
checked++
if (bodyToken === headingToken)
  fail("hierarchy", `body and headings are both --${bodyToken}; the tonal hierarchy is not real`)

for (const mode of ["light", "dark"]) {
  const vars = scope(mode)
  const page = parseOklch(resolve(vars, vars.background))
  const card = parseOklch(resolve(vars, vars["surface-raised"]))
  const tint = parseAlpha(resolve(vars, vars["gray-tint"]))

  const ratioOf = (token, ground) =>
    contrast(luminanceOf(parseOklch(resolve(vars, vars[token]))), luminanceOf(ground))

  for (const [role, token, onTint] of [
    ["body", bodyToken, false],
    ["heading", headingToken, false],
    ["inline code", bodyToken, true],
    ["link", linkToken, false],
  ]) {
    for (const [where, ground] of [["page", page], ["card", card]]) {
      const behind = onTint ? composite(tint.rgb, tint.a, ground) : ground
      const ratio = ratioOf(token, behind)
      checked++
      if (!Number.isFinite(ratio)) fail(role, `non-finite ratio on the ${where}`)
      else if (ratio < 4.5) fail(role, `reads ${ratio.toFixed(2)}:1 on the ${where} in ${mode}, floor is 4.5`)
    }
  }

  /* A heading has to out-contrast the body, or the lift reads as washed-out
     text rather than as a decision. */
  const bodyRatio = ratioOf(bodyToken, page)
  const headingRatio = ratioOf(headingToken, page)
  checked++
  if (headingRatio <= bodyRatio)
    fail("hierarchy", `heading ${headingRatio.toFixed(1)}:1 does not exceed body ${bodyRatio.toFixed(1)}:1 in ${mode}`)

  console.log(
    `${mode.padEnd(6)} body --${bodyToken} ${bodyRatio.toFixed(1)}:1   ` +
      `heading --${headingToken} ${headingRatio.toFixed(1)}:1   ` +
      `inline code ${ratioOf(bodyToken, composite(tint.rgb, tint.a, card)).toFixed(1)}:1 on a card`
  )
}

console.log(`\nmeasure ${measure}ch   rhythm lead ${lead} > flow ${flow} > bind ${bind}`)
console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.label.padEnd(16)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — measure is readable, rhythm groups headings, links are not colour alone\n")
