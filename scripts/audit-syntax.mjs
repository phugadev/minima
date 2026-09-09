/**
 * Syntax palette audit.
 *
 * Two things decide whether a syntax theme works, and neither is taste.
 *
 *   CONTRAST, against the right ground. Every token sits on the code block's
 *   tint, not on the page — and the tint composites differently depending on
 *   whether the block is on the page or on a card, so both are measured.
 *   colour-roles rule 5 is explicit that a tint carries no guarantee of its
 *   own, which is exactly why this file exists.
 *
 *   SEPARATION. Two token colours the eye cannot tell apart are worse than one
 *   colour, because they promise a distinction they do not deliver. The floor
 *   is the same 25 degrees the palette itself was pruned to — the number that
 *   got indigo deleted for sitting 19 degrees from blue.
 *
 *   node scripts/audit-syntax.mjs
 */
import { readFileSync } from "node:fs"
import { srgb, composite, luminanceOf, contrast, HUES } from "./generate-scales.mjs"

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")
const FILES = ["ramps.css", "semantic.css", "depth.css", "syntax.css"]
const HUE_FLOOR = 25
const TEXT_FLOOR = 4.5

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
  const m = v?.match(/^var\(--([\w-]+)(?:,[^)]*)?\)$/)
  return m ? resolve(vars, vars[m[1]], d + 1) : v
}
const oklch = (css) => {
  if (!/^oklch\(/.test(css)) throw new Error(`not a literal colour: ${css}`)
  const [L, C, H] = css.slice(6, -1).split(/\s+/).map(Number)
  if ([L, C].some(Number.isNaN)) throw new Error(`unparseable: ${css}`)
  return { L, C, H: H || 0 }
}
const parseAlpha = (css) => {
  const m = css.match(/^rgb\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)%\)$/)
  if (!m) throw new Error(`unparseable alpha: ${css}`)
  return { rgb: m.slice(1, 4).map((n) => Number(n) / 255), a: Number(m[4]) / 100 }
}

/* Read the roles out of the CSS rather than restating them here — a list kept
   in two places is a list that disagrees with itself. */
const ROLES = [...read("syntax.css").matchAll(/--syntax-([\w-]+):\s*var\(--([\w-]+)\)/g)].map(
  ([, role, token]) => ({ role, token })
)
const COLOURED = ROLES.filter((r) => !["highlight", "gutter"].includes(r.role))

const failures = []
const fail = (label, detail) => failures.push({ label, detail })
let checked = 0

checked++
if (COLOURED.length < 5) fail("roles", `only ${COLOURED.length} read from syntax.css — the check would barely run`)

for (const mode of ["light", "dark"]) {
  const vars = scope(mode)
  const page = srgb(...Object.values(oklch(resolve(vars, vars.background))))
  const card = srgb(...Object.values(oklch(resolve(vars, vars["surface-raised"]))))
  /* Read the block's ground out of prose.css rather than restating it. If the
     code block's background changes, this check has to follow it — a runner
     measuring a colour the page does not use is worse than no runner. */
  const groundToken = (read("prose.css").match(/\.prose pre \{[\s\S]*?background:\s*var\(--([\w-]+)\)/) ?? [])[1]
  if (!groundToken) throw new Error("could not read .prose pre's background — the check cannot run")
  const groundValue = resolve(vars, vars[groundToken])
  const asGround = (base) =>
    /^rgb\(/.test(groundValue)
      ? composite(parseAlpha(groundValue).rgb, parseAlpha(groundValue).a, base)
      : srgb(...Object.values(oklch(groundValue)))

  const grounds = [
    ["on the page", asGround(page)],
    ["on a card", asGround(card)],
  ]

  const worst = []
  for (const { role, token } of COLOURED) {
    const value = resolve(vars, vars[`syntax-${role}`])
    const rgb = srgb(...Object.values(oklch(value)))
    let lowest = Infinity
    for (const [where, ground] of grounds) {
      const ratio = contrast(luminanceOf(rgb), luminanceOf(ground))
      checked++
      if (!Number.isFinite(ratio)) fail(role, `non-finite ratio ${where}`)
      else if (ratio < TEXT_FLOOR)
        fail(role, `${token} reads ${ratio.toFixed(2)}:1 ${where} in ${mode}, floor is ${TEXT_FLOOR}`)
      lowest = Math.min(lowest, ratio)
    }
    worst.push(`${role} ${lowest.toFixed(1)}`)
  }
  console.log(`${mode.padEnd(6)} worst on --${groundToken} — ${worst.join(", ")}`)
}

/* ── Separation ──────────────────────────────────────────────────────────── */
const hueOf = (token) => {
  const name = token.replace(/-text.*$/, "")
  return HUES.find((h) => h.name === name)?.hue
}
const chromatic = COLOURED.map((r) => ({ ...r, hue: hueOf(r.token) })).filter((r) => r.hue != null)
const pairs = []
for (let i = 0; i < chromatic.length; i++)
  for (let j = i + 1; j < chromatic.length; j++) {
    const raw = Math.abs(chromatic[i].hue - chromatic[j].hue)
    const gap = Math.min(raw, 360 - raw)
    checked++
    pairs.push({ a: chromatic[i].role, b: chromatic[j].role, gap })
    if (gap < HUE_FLOOR)
      fail("separation", `${chromatic[i].role} and ${chromatic[j].role} are ${gap} degrees apart, floor is ${HUE_FLOOR}`)
  }
const closest = pairs.length ? pairs.reduce((a, b) => (a.gap < b.gap ? a : b)) : null
checked++
if (!closest) fail("separation", "no chromatic roles found — the check would pass by doing nothing")
else console.log(`\n${chromatic.length} chromatic roles, closest pair: ${closest.a} / ${closest.b} at ${closest.gap} degrees`)

console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.label.padEnd(14)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every token is legible on the code ground and no two are confusable\n")
