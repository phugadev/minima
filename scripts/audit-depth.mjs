/**
 * Depth audit.
 *
 * Shadows are the easiest thing in a design system to get subtly wrong, and
 * the wrongness is never in the colour — it is in the geometry. A single
 * layer, a blur smaller than the offset, a positive spread haloing out past
 * the object's sides: each is a specific, checkable defect, and each is why a
 * shadow reads as pasted on rather than cast.
 *
 * So this checks the invariants a good shadow has, not whether the numbers are
 * the ones somebody liked. It also resolves every elevated SURFACE through the
 * ramps and proves text still clears the floor on it, because dark mode raises
 * surfaces by lightening them — which spends contrast the text was relying on.
 *
 *   node scripts/audit-depth.mjs
 *
 * The asymmetry between modes is reported rather than asserted, for the same
 * reason the scrim is: light carries depth in the shadow, dark carries it in
 * the surface, and a floor that pretended otherwise would encode a fiction.
 */
import { readFileSync } from "node:fs"
import { srgb, composite, relLuminance, contrast } from "./generate-scales.mjs"

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")
const SELECTOR = {
  light: ':root[data-theme="minima"] {',
  dark: ':root[data-theme="minima"].dark {',
}
/* Depth has two orders, and conflating them is the bug this separation exists
   to prevent. Surfaces are ordered by what sits on what — a popover can be
   anchored inside a dialog, so it must be lighter than one. Shadows are
   ordered by apparent size — a dialog is a bigger object and casts a bigger
   shadow regardless of what it is stacked on. */
const RUNGS = ["raised", "overlay", "modal"]
const BY_SIZE = ["raised", "overlay", "modal"]
const BY_STACK = ["raised", "modal", "overlay"]

/* Below this the shadow is well-formed and invisible. Not derived — it is the
   point at which the rungs were judged distinguishable by eye, written down so
   a later retune cannot quietly drop back under it. */
const MIN_CONTACT_ALPHA = 0.12

function declarations(css, selector) {
  const start = css.indexOf(selector)
  if (start === -1) return {}
  const body = css.slice(start, css.indexOf("\n}", start))
  const out = {}
  for (const [, k, v] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[k] = v.trim()
  return out
}

/** Everything that applies in one mode, with dark's declarations winning. */
function scope(mode) {
  const files = ["ramps.css", "semantic.css", "depth.css"].map(read)
  const merged = {}
  for (const css of files) Object.assign(merged, declarations(css, SELECTOR.light))
  if (mode === "dark")
    for (const css of files) Object.assign(merged, declarations(css, SELECTOR.dark))
  return merged
}

/** Follow var() chains until something concrete falls out. */
function resolve(vars, value, depth = 0) {
  if (depth > 12) throw new Error(`var cycle at ${value}`)
  const m = value.match(/^var\(--([\w-]+)\)$/)
  return m ? resolve(vars, vars[m[1]], depth + 1) : value
}

const oklch = (css) => {
  const [L, C, H] = css.slice(6, -1).split(/\s+/).map(Number)
  return { L, C, H: H || 0 }
}
const lum = (css) => {
  const { L, C, H } = oklch(css)
  return relLuminance(L, C, H)
}

/** `0 1px 2px -1px rgb(0 0 0 / 0.12)` → geometry and alpha, separately. */
function layers(value) {
  return value.split(/,(?![^(]*\))/).map((raw) => {
    const m = raw.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+rgb\([^/]*\/\s*([\d.]+)\)$/)
    if (!m) throw new Error(`unparseable shadow layer: ${raw.trim()}`)
    const [x, y, blur, spread] = m.slice(1, 5).map((n) => parseFloat(n))
    return { geometry: [x, y, blur, spread], alpha: Number(m[5]) }
  })
}

const failures = []
const fail = (mode, label, detail) => failures.push({ mode, label, detail })
let checked = 0

const geometry = {}
for (const mode of ["light", "dark"]) {
  const vars = scope(mode)
  const page = srgb(...Object.values(oklch(resolve(vars, vars.background))))
  const fg = resolve(vars, vars.foreground)
  const muted = resolve(vars, vars["muted-foreground"])

  let contactAlpha = null

  for (const rung of RUNGS) {
    const shadow = layers(vars[`depth-${rung}`])
    checked++

    /* A one-layer shadow is a smudge. The contact/ambient pair is the whole
       reason a cast shadow looks cast. */
    if (shadow.length !== 2) fail(mode, `depth-${rung}`, `${shadow.length} layer(s), expected 2`)

    for (const [i, { geometry: g, alpha }] of shadow.entries()) {
      const [x, y, blur, spread] = g
      const which = i === 0 ? "contact" : "ambient"
      if (x !== 0) fail(mode, `depth-${rung}.${which}`, `x offset ${x}, light comes from above`)
      if (blur <= y) fail(mode, `depth-${rung}.${which}`, `blur ${blur} <= offset ${y} — hard drop shadow`)
      if (spread >= 0) fail(mode, `depth-${rung}.${which}`, `spread ${spread} halos past the object`)
      if (alpha <= 0 || alpha >= 1) fail(mode, `depth-${rung}.${which}`, `alpha ${alpha} out of range`)
    }

    /* Geometry must be identical in both modes: a theme toggle may change what
       a component looks like, never how much room it takes up. */
    const key = shadow.map((l) => l.geometry.join(" ")).join(" | ")
    if (mode === "light") geometry[rung] = key
    else if (geometry[rung] !== key)
      fail(mode, `depth-${rung}`, `geometry differs from light: ${key} vs ${geometry[rung]}`)

    /* The contact layer is the cue that says "this edge is off the page", and
       it must not encode height — weakening it as the rung climbs reads as
       flatter rather than further. So it is one value across every rung, and
       it has a floor, because a well-formed shadow can still be invisible. */
    if (contactAlpha === null) contactAlpha = shadow[0].alpha
    else if (shadow[0].alpha !== contactAlpha)
      fail(mode, `depth-${rung}`, `contact alpha ${shadow[0].alpha} differs from ${contactAlpha} — height belongs in the ambient layer`)
    if (shadow[0].alpha < MIN_CONTACT_ALPHA)
      fail(mode, `depth-${rung}`, `contact alpha ${shadow[0].alpha} is below the visible floor ${MIN_CONTACT_ALPHA}`)

    /* Raising a surface in dark mode spends the contrast its text was living
       on. This is the floor that limits how far dark elevation can climb. */
    const y = lum(resolve(vars, vars[`surface-${rung}`]))
    checked++
    for (const [name, colour, floor] of [
      ["foreground", fg, 4.5],
      ["muted-foreground", muted, 4.5],
    ]) {
      const ratio = contrast(lum(colour), y)
      checked++
      if (ratio < floor)
        fail(mode, `surface-${rung}`, `${name} reads ${ratio.toFixed(2)}:1, floor is ${floor}`)
    }
  }

  /* Footprint grows with apparent size; surface lightness grows with stacking
     order. Two different sequences over the same three rungs. */
  let extent = 0
  for (const rung of BY_SIZE) {
    const next = Math.max(...layers(vars[`depth-${rung}`]).map(({ geometry: g }) => g[1] + g[2]))
    checked++
    if (next <= extent)
      fail(mode, `depth-${rung}`, `footprint ${next}px does not exceed the rung below it (${extent}px)`)
    extent = next
  }

  let surface = lum(resolve(vars, vars.background))
  for (const rung of BY_STACK) {
    const next = lum(resolve(vars, vars[`surface-${rung}`]))
    checked++
    if (next < surface)
      fail(mode, `surface-${rung}`, `is darker than the rung it can be stacked on`)
    surface = next
  }

  /* A selected chip inside a segmented group reads against its TRACK, not the
     page. Both have to move away from the page, in whichever direction the
     mode has room, and the chip has to clear the track by enough to look
     lifted — that gap is what makes the control read the same in both modes.

     Measured in ENCODED sRGB points rather than relative luminance. Luminance
     is linear light and collapses near black: the dark track sits 9 visible
     points above its page and only 0.003 of luminance, which failed a
     luminance threshold that the light track passed comfortably. Encoded sRGB
     is roughly perceptual, so one floor works at both ends of the range.

     The track's depth is capped by something real: it has to stay light (or
     dark) enough to carry an INACTIVE label at 4.5:1, and in light mode that
     lands exactly on gray-4. One step further and the labels fail. */
  const TRACK_FLOOR = 6
  const CHIP_FLOOR = 12
  const level = (name) =>
    Math.round(srgb(...Object.values(oklch(resolve(vars, vars[name]))))[0] * 255)

  const track = level("control-track")
  const chip = level("surface-selected")
  const pageLevel = level("background")
  const label = contrast(lum(muted), lum(resolve(vars, vars["control-track"])))
  checked += 3

  if (Math.abs(track - pageLevel) < TRACK_FLOOR)
    fail(mode, "control-track", `is ${Math.abs(track - pageLevel)} points from the page, floor is ${TRACK_FLOOR}`)
  if (Math.abs(chip - track) < CHIP_FLOOR)
    fail(mode, "surface-selected", `clears its track by ${Math.abs(chip - track)} points, floor is ${CHIP_FLOOR} — it will not read as lifted`)
  if (label < 4.5)
    fail(mode, "control-track", `an inactive label on it reads ${label.toFixed(2)}:1, floor is 4.5`)

  console.log(
    `${" ".repeat(7)}group    page ${pageLevel} -> track ${track} -> selected ${chip}` +
      `  (chip clears track by ${Math.abs(chip - track)}, inactive label ${label.toFixed(2)}:1)`
  )

  /* Reported, not asserted: how much the contact shadow can actually darken
     the page it falls on. This is the number the whole light/dark asymmetry
     rests on, so it is printed every run rather than trusted from a comment. */
  const bite = (rung) => {
    const a = layers(vars[`depth-${rung}`])[0].alpha
    const after = composite([0, 0, 0], a, page)
    return `${Math.round(page[0] * 255)}→${Math.round(after[0] * 255)}`
  }
  console.log(
    `${mode.padEnd(6)} contact shadow moves the page ` +
      RUNGS.map((r) => `${r} ${bite(r)}`).join(", ")
  )
  console.log(
    `${" ".repeat(7)}surfaces ` +
      BY_STACK.map((r) => {
        const s = resolve(vars, vars[`surface-${r}`])
        return `${r} ${Math.round(srgb(...Object.values(oklch(s)))[0] * 255)}`
      }).join(", ") +
      `  (page ${Math.round(page[0] * 255)})`
  )
}

console.log(
  `\n${checked} checks — light ${failures.filter((f) => f.mode === "light").length} / ` +
    `dark ${failures.filter((f) => f.mode === "dark").length}`
)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  [${f.mode}] ${f.label.padEnd(26)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every rung is a two-layer cast shadow on a surface that carries text\n")
