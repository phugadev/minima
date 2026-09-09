/**
 * Drift, direction one: have WE drifted off the tokens?
 *
 * A Minima component carries design — that is the point of forking it — but it
 * carries design expressed as TOKENS. The moment one contains a literal, it has
 * stopped being part of the system and started being a thing that merely looks
 * like it, and it will quietly stop matching when the ramp is retuned. That is
 * exactly how minima-old ended up with ten components nobody could account for.
 *
 * So: no hex, no rgb(), no Tailwind palette colours, no arbitrary pixel values,
 * no ramp STEP NUMBERS (colour-roles rule 3 — ask for a role), and no Tailwind
 * default text sizes, which bypass the type registers entirely.
 *
 *   node scripts/audit-components.mjs
 *
 * Files we have not ported yet are listed, not failed. A checker that fails on
 * work nobody has started is a checker people learn to ignore.
 */
import { readFileSync, readdirSync } from "node:fs"
import { componentUrl, componentsDir, componentPath, readCss, LAYOUT } from "./sources.mjs"

/* The components we claim to own. Adding a file here is the act of taking
   responsibility for it — nothing scans itself into this list.

   Bare filenames, not paths: the directory is sources.mjs's business, and the
   last time this list carried a path prefix it was the wrong one, so the
   "unclaimed" report matched nothing and named every ported component. */
const OWNED = ["stat.tsx", "status.tsx", "button.tsx", "tabs.tsx", "input.tsx"]

const TW_PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const OUR_HUES = "gray|red|orange|amber|green|teal|cyan|blue|purple|pink"
const PROPS = "bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|accent|caret|divide|placeholder"

const RULES = [
  {
    name: "literal colour",
    re: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab)\(/g,
    why: "a colour that is not a token cannot follow a retune",
  },
  {
    name: "Tailwind palette colour",
    re: new RegExp(`\\b(?:${PROPS})-(?:${TW_PALETTE})-\\d{2,3}\\b`, "g"),
    why: "that is Tailwind's palette, not Minima's ramp",
  },
  {
    name: "ramp step number",
    re: new RegExp(`\\b(?:${PROPS})-(?:${OUR_HUES})-(?:10|[1-9])\\b`, "g"),
    why: "ask for a role, never a step number — renumbering silently changes meaning (colour-roles rule 3)",
  },
  {
    name: "arbitrary literal value",
    /* Arbitrary values are fine when they compute from tokens. They are a
       literal when they hard-code a measurement. */
    re: /-\[(?![^\]]*(?:var\(|calc\(|min\(|max\(|clamp\(|&))[^\]]*\d+(?:px|rem|em|%)[^\]]*\]/g,
    why: "hard-codes a measurement instead of deriving it from a token",
  },
  {
    name: "Tailwind default text size",
    re: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
    why: "bypasses the type registers — use text-body, text-caption, text-label…",
  },
]

const findings = []
for (const file of OWNED) {
  const src = readFileSync(componentUrl(file), "utf8")
  const lines = src.split("\n")
  for (const rule of RULES) {
    for (const [i, line] of lines.entries()) {
      /* Comments explain the rules; they are not violations of them. */
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "")
      for (const m of code.matchAll(rule.re)) {
        findings.push({ file: componentPath(file), line: i + 1, rule: rule.name, hit: m[0], why: rule.why })
      }
    }
  }
}

/* ── Are the size variants one family? ──────────────────────────────────────
   A size ramp where only the HEIGHT changes is not a set of sizes, it is one
   control stretched. Radius and padding have to track height or the small end
   reads as a pill and the large end as a box — which is exactly what shipped:
   a fixed 10px radius gave radius/height 0.42 at xs and 0.28 at lg, a 1.5x
   spread, while looking deliberate because the classes said `min(...)`.

   The band is on the RATIO, not the value. Sizes are allowed to share a radius
   (10px suits both 28 and 32); what they may not do is drift apart in shape. */
const RATIO_SPREAD = 1.25
/* Read from space.css, not typed here. These were a hardcoded
   { xs: 24, sm: 28, md: 32, lg: 36 }, which is a list kept in two places and
   therefore a list that will eventually disagree with itself: retuning the
   ladder would have left this check comparing new radii against old heights
   and still printing PASS. */
const CONTROL_PX = {}
{
  const space = readCss("space")
  const root = space.slice(space.indexOf(":root {"), space.indexOf("\n}", space.indexOf(":root {")))
  for (const [, k, v] of root.matchAll(/--control-(\w+):\s*([\d.]+)rem/g)) CONTROL_PX[k] = Number(v) * 16
  if (Object.keys(CONTROL_PX).length < 4)
    throw new Error("could not read the control ladder from space.css — the ratio checks would compare against nothing")
}
const RADIUS_PX = {}
{
  const minima = readCss("semantic")
  for (const [, k, v] of minima.matchAll(/--rung-control-(\w+):\s*([\d.]+)rem/g))
    RADIUS_PX[k] = Number(v) * 16
}
const button = readFileSync(componentUrl("button.tsx"), "utf8")
const PAD_PX = {}
for (const [, size, cls] of button.matchAll(/(?:^|\s)"?(default|xs|sm|lg)"?:\s*\n?\s*"([^"]+)"/gm)) {
  const m = cls.match(/\bpx-([\d.]+)/)
  if (m) PAD_PX[size === "default" ? "md" : size] = Number(m[1]) * 4
}

const ratios = (map, label) => {
  const vals = Object.entries(CONTROL_PX)
    .filter(([k]) => map[k] != null)
    .map(([k, h]) => [k, map[k] / h])
  if (vals.length < 3) {
    findings.push({ file: componentPath("button.tsx"), line: 0, rule: `${label} coherence`, hit: "unreadable", why: "could not read enough sizes — the check would pass by doing nothing" })
    return null
  }
  const nums = vals.map(([, r]) => r)
  const spread = Math.max(...nums) / Math.min(...nums)
  if (spread > RATIO_SPREAD) {
    findings.push({
      file: "registry/ui/button.tsx",
      line: 0,
      rule: `${label} coherence`,
      hit: `${spread.toFixed(2)}x spread`,
      why: `${label}/height ranges ${Math.min(...nums).toFixed(2)}–${Math.max(...nums).toFixed(2)} across sizes; the ceiling is ${RATIO_SPREAD}x`,
    })
  }
  return vals.map(([k, r]) => `${k} ${r.toFixed(2)}`).join("  ")
}
const radiusReport = ratios(RADIUS_PX, "radius")
const padReport = ratios(PAD_PX, "padding")
if (radiusReport) console.log(`radius/height   ${radiusReport}`)
if (padReport) console.log(`padding/height  ${padReport}`)
console.log("")

/* Anything in registry/ui that nobody has claimed in OWNED. The prefix here
   used to be `components/ui/`, left over from before the registry layout, so
   nothing ever matched and every ported component was reported as unported —
   a list that was wrong in the one direction that hides a real gap: a file
   shipped through the registry and scanned by no rule at all. */
const all = readdirSync(componentsDir()).filter((f) => f.endsWith(".tsx"))
const unclaimed = all.filter((f) => !OWNED.includes(f))

console.log(`owned     ${OWNED.length} of ${all.length} component file(s) in ${componentPath("").replace(/\/$/, "")}`)
if (unclaimed.length) {
  /* Severity depends on the tree, and the difference is real rather than
     convenient. In the registry an unclaimed file SHIPS — it goes out through
     the registry with no rule above having looked at it, which is a defect. In
     the lab the same file is a stock shadcn component nobody has ported yet:
     that is the backlog, and failing on a backlog every single run is how a
     checker teaches people to stop reading it. */
  const label = LAYOUT === "registry" ? "unclaimed" : "unported"
  console.log(`${label} ${unclaimed.length}: ${unclaimed.map((f) => f.replace(".tsx", "")).join(", ")}`)
  if (LAYOUT === "registry")
    findings.push({
      file: "scripts/audit-components.mjs",
      line: 0,
      rule: "unclaimed component",
      hit: unclaimed.map(componentPath).join(", "),
      why: "shipped through the registry but absent from OWNED, so no rule above has ever looked at it",
    })
}
console.log(`\n${OWNED.length * RULES.length} checks — ${findings.length} literal(s) found`)

if (findings.length) {
  console.log("")
  const byFile = {}
  for (const f of findings) (byFile[f.file] ??= []).push(f)
  for (const [file, list] of Object.entries(byFile)) {
    console.log(`  ${file}`)
    for (const f of list.slice(0, 12)) {
      console.log(`    ${String(f.line).padStart(4)}  ${f.rule.padEnd(26)} ${f.hit}`)
    }
    if (list.length > 12) console.log(`    …and ${list.length - 12} more`)
  }
  console.log("")
  process.exit(1)
}
console.log("PASS — every owned component is expressed in tokens\n")
