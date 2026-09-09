/**
 * Native surface audit.
 *
 * Everything else here checks colour and geometry in our own CSS. This checks
 * the surface we do NOT draw — scrollbars, selection, the caret, native form
 * controls — plus the one geometric rule that is an accessibility floor rather
 * than a design choice.
 *
 * It exists because that blind spot had already cost something: the dark theme
 * shipped with light scrollbars for the whole build, and compact density
 * shipped a 20px button, and neither was visible to any runner because neither
 * lived in a place a runner was looking.
 *
 *   node scripts/audit-native.mjs
 */
import { readFileSync } from "node:fs"
import { srgb, composite, luminanceOf, contrast } from "./generate-scales.mjs"
import { readCss } from "./sources.mjs"

const read = (f) => readCss(f.replace(/\.css$/, ""))
const NATIVE = read("native.css")
const SPACE = read("space.css")
const FILES = ["ramps.css", "semantic.css", "depth.css", "state.css", "native.css"]

/* WCAG 2.2 SC 2.5.8, Target Size (Minimum), level AA. */
const TARGET_FLOOR = 24

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

/* ── The browser has to be told which scheme it is drawing ───────────────── */
for (const [selector, expected] of [[":root", "light"], [".dark", "dark"]]) {
  checked++
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{[^}]*color-scheme:\\s*${expected}`)
  if (!re.test(NATIVE))
    fail("color-scheme", `${selector} does not declare color-scheme: ${expected} — scrollbars and native controls will render in the wrong scheme`)
}

/* ── Native accents ──────────────────────────────────────────────────────── */
for (const prop of ["accent-color", "caret-color"]) {
  checked++
  if (!new RegExp(`${prop}:\\s*var\\(`).test(NATIVE))
    fail(prop, "not bound to a token — falls back to the operating system's choice")
}
checked++
if (!/::selection\s*\{/.test(NATIVE)) fail("::selection", "undefined — selection uses the browser's own colour")

/* ── Selection has to stay readable on real grounds ──────────────────────── */
const selection = NATIVE.slice(NATIVE.indexOf("::selection"), NATIVE.indexOf("}", NATIVE.indexOf("::selection")))
const bgToken = (selection.match(/background-color:\s*var\(--([\w-]+)/) ?? [])[1]
/* Anchored: an unanchored /color:/ matches "background-color" first, which
   handed the text colour the background's token and made the whole check
   measure a colour against itself. */
const fgToken = (selection.match(/(?:^|[\s;{])color:\s*var\(--([\w-]+)/m) ?? [])[1]
if (!bgToken || !fgToken) throw new Error("could not read ::selection's colours — the check cannot run")
if (bgToken === fgToken) throw new Error(`::selection background and text both resolved to --${bgToken}`)

for (const mode of ["light", "dark"]) {
  const vars = scope(mode)
  const page = parseOklch(resolve(vars, vars.background))
  const card = parseOklch(resolve(vars, vars["surface-raised"]))
  const fg = parseOklch(resolve(vars, vars[fgToken]))
  const tint = parseAlpha(resolve(vars, vars[bgToken]))
  const results = []
  for (const [where, ground] of [["page", page], ["card", card]]) {
    const behind = composite(tint.rgb, tint.a, ground)
    const ratio = contrast(luminanceOf(fg), luminanceOf(behind))
    checked++
    if (!Number.isFinite(ratio)) fail("::selection", `non-finite ratio on the ${where}`)
    else if (ratio < 4.5) fail("::selection", `selected text reads ${ratio.toFixed(2)}:1 on the ${where} in ${mode}`)
    results.push(`${where} ${ratio.toFixed(1)}`)
  }
  console.log(`${mode.padEnd(6)} selected text ${results.join(", ")}`)
}

/* ── No pointer target below the floor, in ANY density ───────────────────── */
const densities = [...SPACE.matchAll(/:root(?:\[data-density="(\w+)"\])?\s*\{([\s\S]*?)\n\}/g)]
const report = []
for (const [, name = "default", body] of densities) {
  const rungs = [...body.matchAll(/--control-(\w+):\s*([\d.]+)rem/g)].map(([, k, v]) => [k, Number(v) * 16])
  if (!rungs.length) continue
  for (const [rung, px] of rungs) {
    checked++
    if (px < TARGET_FLOOR)
      fail("target size", `--control-${rung} is ${px}px at density "${name}" — WCAG 2.2 SC 2.5.8 floor is ${TARGET_FLOOR}px`)
  }
  report.push(`${name} ${rungs.map(([k, px]) => `${k} ${px}`).join("/")}`)
}
checked++
if (!densities.length) fail("target size", "no control rungs found — the check would pass by doing nothing")

console.log(`\ncontrol rungs: ${report.join("   ")}`)
console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.label.padEnd(14)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — the browser knows the scheme, selection is ours and readable, every target clears 24px\n")
