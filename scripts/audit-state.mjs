/**
 * Focus ring audit.
 *
 * Of everything in this system, the focus ring is the one with a person behind
 * it. Someone navigating by keyboard has no pointer telling them where they
 * are; a ring that fails to show up is not a rough edge, it is a wall. So it
 * gets checked hardest and it gets checked against every surface it can
 * actually land on, not just the page.
 *
 * WCAG 2.2 SC 1.4.11 puts a non-text indicator at 3:1 against what is adjacent
 * to it. The ring is held off the control by an offset, so what is adjacent is
 * the GAP — whatever the control happens to be sitting on. That is the whole
 * reason for the offset, and it is why this file enumerates surfaces rather
 * than checking one pairing.
 *
 *   node scripts/audit-state.mjs
 */
import { readFileSync } from "node:fs"
import { srgb, composite, luminanceOf, contrast } from "./generate-scales.mjs"
import { readCss } from "./sources.mjs"

const read = (f) => readCss(f.replace(/\.css$/, ""))
const FILES = ["ramps.css", "semantic.css", "depth.css", "state.css"]
const FLOOR = 3

function declarations(css, selector) {
  const start = css.indexOf(selector)
  if (start === -1) return {}
  const body = css.slice(start, css.indexOf("\n}", start))
  const out = {}
  for (const [, k, v] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[k] = v.trim()
  return out
}

function scope(mode) {
  const merged = {}
  for (const f of FILES) {
    const css = read(f)
    Object.assign(merged, declarations(css, ":root {"))
    Object.assign(merged, declarations(css, ':root[data-theme="minima"] {'))
  }
  if (mode === "dark")
    for (const f of FILES)
      Object.assign(merged, declarations(read(f), ':root[data-theme="minima"].dark {'))
  return merged
}

const resolve = (vars, value, depth = 0) => {
  if (depth > 12) throw new Error(`var cycle at ${value}`)
  const m = value.match(/^var\(--([\w-]+)\)$/)
  return m ? resolve(vars, vars[m[1]], depth + 1) : value
}

const parseOklch = (css) => {
  if (!/^oklch\(/.test(css)) throw new Error(`not a literal colour: ${css}`)
  const [L, C, H] = css.slice(6, -1).split(/\s+/).map(Number)
  if ([L, C].some(Number.isNaN)) throw new Error(`unparseable oklch: ${css}`)
  return srgb(L, C, H || 0)
}
const parseAlpha = (css) => {
  const m = css.match(/^rgb\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)%\)$/)
  if (!m) throw new Error(`unparseable alpha: ${css}`)
  return { rgb: m.slice(1, 4).map((n) => Number(n) / 255), a: Number(m[4]) / 100 }
}

const failures = []
let checked = 0

for (const mode of ["light", "dark"]) {
  const vars = scope(mode)
  const ring = parseOklch(resolve(vars, vars.focus))
  const page = parseOklch(resolve(vars, vars.background))
  const card = parseOklch(resolve(vars, vars["surface-raised"]))

  /* Every ground a focused control can be sitting on. Opaque surfaces are
     taken as-is; tints are composited onto both the page and a card, because
     a tint is a different colour depending on which it lands on. */
  const grounds = [
    ["page", page],
    ["card", card],
    ["overlay", parseOklch(resolve(vars, vars["surface-overlay"]))],
    ["modal", parseOklch(resolve(vars, vars["surface-modal"]))],
    ["selected chip", parseOklch(resolve(vars, vars["surface-selected"]))],
  ]
  for (const [role, base] of [["page", page], ["card", card]]) {
    for (const rung of ["control-track", "secondary", "accent"]) {
      const value = resolve(vars, vars[rung])
      grounds.push([
        `${rung} on the ${role}`,
        /^rgb\(/.test(value)
          ? composite(parseAlpha(value).rgb, parseAlpha(value).a, base)
          : parseOklch(value),
      ])
    }
  }

  const results = []
  for (const [name, ground] of grounds) {
    const ratio = contrast(luminanceOf(ring), luminanceOf(ground))
    checked++
    if (!Number.isFinite(ratio)) failures.push({ mode, name, detail: "non-finite ratio" })
    else if (ratio < FLOOR)
      failures.push({ mode, name, detail: `ring reads ${ratio.toFixed(2)}:1, floor is ${FLOOR}` })
    results.push(`${name} ${ratio.toFixed(2)}`)
  }
  const worst = results.reduce((a, b) =>
    Number(a.split(" ").pop()) < Number(b.split(" ").pop()) ? a : b
  )
  console.log(`${mode.padEnd(6)} focus ring on ${grounds.length} surfaces — worst: ${worst}:1`)
}

console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  [${f.mode}] ${f.name.padEnd(26)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — the focus ring clears 3:1 on every surface a control can sit on\n")
