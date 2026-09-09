/**
 * Alpha audit.
 *
 * The alpha rungs make one falsifiable claim: composited over paper (light) or
 * ink (dark), each translucent value reproduces its opaque twin exactly. This
 * checks that claim against the SHIPPED FILE rather than against the
 * generator's own arithmetic — it parses src/ramps.css, composites what is
 * actually written there, and compares it to the opaque step written beside
 * it. So it catches rounding, formatting and emitter bugs too, not just bad
 * maths.
 *
 *   node scripts/audit-alpha.mjs
 *
 * Tolerance is one 8-bit step. Anything the browser cannot represent is not a
 * difference worth failing over; anything larger is a real drift.
 */
import { readFileSync } from "node:fs"
import {
  ALPHA_ROLES,
  REFERENCE,
  SCRIM,
  HUES,
  srgb,
  composite,
  luminanceOf,
  contrast,
} from "./generate-scales.mjs"

const CSS = readFileSync(new URL("../src/ramps.css", import.meta.url), "utf8")
const NAMES = ["gray", ...HUES.map((h) => h.name)]
const TOLERANCE = 1 / 255

/** The declarations inside one mode's block, as a flat map. */
function blockOf(selector) {
  const start = CSS.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`no block for ${selector}`)
  const body = CSS.slice(start, CSS.indexOf("\n}", start))
  const vars = {}
  for (const [, k, v] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[k] = v.trim()
  return vars
}

/* Role names are aliases — `--red-text: var(--red-9)` — so anything measured
   by role has to be followed to a literal first. Skipping this produced NaN,
   and NaN < 4.5 is false, so an entire check passed by never evaluating. */
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

const drift = []
const failures = []
const fail = (mode, label, detail) => failures.push({ mode, label, detail })

let checked = 0
for (const [mode, selector] of [
  ["light", ':root[data-theme="minima"]'],
  ["dark", ':root[data-theme="minima"].dark'],
]) {
  const vars = blockOf(selector)
  const ref = REFERENCE(mode)

  for (const name of NAMES) {
    let previous = 0
    for (const [role, step] of Object.entries(ALPHA_ROLES)) {
      const key = `${name}-${role}`
      if (!vars[key]) {
        fail(mode, key, "missing")
        continue
      }
      const { rgb, a } = parseAlpha(vars[key])
      const target = parseOklch(vars[`${name}-${step}`])
      const got = composite(rgb, a, ref)
      const drift = Math.max(...got.map((c, i) => Math.abs(c - target[i])))
      checked++

      if (drift > TOLERANCE) {
        fail(mode, key, `drifts ${(drift * 255).toFixed(2)}/255 from ${name}-${step}`)
      }
      /* A rung at zero does nothing; a rung at one is not translucent. Both
         mean the solve degenerated rather than that somebody chose them. */
      if (a <= 0 || a >= 1) fail(mode, key, `alpha out of range at ${a}`)
      /* The veils must get heavier down the ladder. An inverted pair is
         invisible in a swatch grid and obvious in a component. */
      if (a <= previous) {
        fail(mode, key, `alpha ${a} is not heavier than the rung above (${previous})`)
      }
      previous = a
    }
  }

  /* A tint reproduces its opaque step OVER THE REFERENCE. On any other ground
     it composites differently — that is the whole point of it — which means a
     contrast guarantee proved against the opaque step does NOT travel with the
     translucent twin. The destructive button found this the hard way: red-text
     on red-tint measures fine over the page and 4.3:1 over a card, because the
     card lifts the ground out from under it.

     So every tint that a recipe puts text on gets checked on the real grounds
     it can land on, not just the reference. Where this fails, the answer is to
     use the opaque fill — a tint is for surfaces whose ground is unknown, and
     text on an unknown ground was never something the ramps could promise. */
  const grounds = {
    page: parseOklch(vars[mode === "light" ? "gray-2" : "gray-1"]),
    card: parseOklch(vars[mode === "light" ? "gray-1" : "gray-2"]),
  }
  for (const name of NAMES) {
    const text = parseOklch(resolve(vars, vars[`${name}-text`]))
    for (const [where, ground] of Object.entries(grounds)) {
      const { rgb, a } = parseAlpha(vars[`${name}-tint`])
      const ratio = contrast(luminanceOf(text), luminanceOf(composite(rgb, a, ground)))
      checked++
      /* A measurement that is not a number is a broken check, not a pass. */
      if (!Number.isFinite(ratio)) fail(mode, `${name}-tint`, "produced a non-finite ratio")
      else if (ratio < 4.5) {
        drift.push(`${name}-text on ${name}-tint over the ${where}: ${ratio.toFixed(2)}:1`)
      }
    }
  }

  /* The scrim is a chosen constant, so the only thing worth asserting is that
     it is present and pointed the right way — it must darken, in both modes,
     including the mode where the page is already dark. */
  const scrim = parseAlpha(vars.scrim)
  const page = parseOklch(vars[mode === "light" ? "gray-2" : "gray-1"])
  const scrimmed = composite(scrim.rgb, scrim.a, page)
  if (luminanceOf(scrimmed) >= luminanceOf(page)) {
    fail(mode, "scrim", "does not darken the page")
  }
  checked++

  /* Reported, not asserted. Dark mode cannot reach 3:1 between a scrimmed page
     and the surface above it — near-black has nowhere to go — so elevation
     there is carried by the surface being lighter and by a border, not by the
     scrim. Printing the number keeps that honest instead of letting a floor
     quietly encode a fiction. */
  const surface = parseOklch(vars[mode === "light" ? "gray-1" : "gray-2"])
  const separation = contrast(luminanceOf(surface), luminanceOf(scrimmed))
  console.log(
    `${mode.padEnd(6)} scrim ${String(SCRIM[mode] * 100).padStart(3)}%  ` +
      `dialog surface clears the dimmed page at ${separation.toFixed(2)}:1`
  )
}

if (drift.length) {
  console.log("\ntints that cannot carry their own text on a real ground (use the opaque fill):")
  for (const d of drift) console.log(`  ${d}`)
}
console.log(
  `\n${checked} checks — light ${failures.filter((f) => f.mode === "light").length} / ` +
    `dark ${failures.filter((f) => f.mode === "dark").length}`
)

if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  [${f.mode}] ${f.label.padEnd(28)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every alpha rung reproduces its opaque step\n")
