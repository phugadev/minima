/**
 * Contrast audit, at the ramp level.
 *
 * The old audit drove a browser against a running app and checked the semantic
 * layer. This checks the layer underneath — the ramps themselves — which is
 * what a chroma change actually moves, and it runs in Node in milliseconds.
 * That speed is the point: it makes "how neon can we go" a measurement rather
 * than an argument.
 *
 *   node scripts/audit-ramps.mjs                 # current chroma
 *   node scripts/audit-ramps.mjs --chroma=1.3    # 30% more chroma
 *   node scripts/audit-ramps.mjs --sweep         # find the ceiling
 *
 * Every check below is a pairing one of the recipes actually makes. A floor
 * nobody's UI depends on is a floor worth deleting, not defending.
 */
import {
  HUES,
  STEPS,
  L_LIGHT,
  L_DARK,
  L_GRAY_LIGHT,
  L_GRAY_DARK,
  C_LIGHT,
  C_DARK,
  ramp,
  grayRamp,
  relLuminance,
  contrast,
  CHROMA,
  MARK_STEP,
  TEXT_BEARING,
} from "./generate-scales.mjs"

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split("=")[1] : fallback
}
const SWEEP = process.argv.includes("--sweep")

/** Parse `oklch(L C H)` back into components so we can measure it. */
const parse = (css) => {
  const [L, C, H] = css.slice(6, -1).split(/\s+/).map(Number)
  return { L, C, H: H || 0 }
}
const lum = (css) => {
  const { L, C, H } = parse(css)
  return relLuminance(L, C, H)
}

/** Every ramp for one mode at a given chroma scale, as a flat map. */
function build(mode, chromaScale) {
  const light = mode === "light"
  const lTrack = light ? L_LIGHT : L_DARK
  const cTrack = light ? C_LIGHT : C_DARK
  const biasScale = light ? 1 : 0.6
  const vars = {}
  grayRamp(light ? L_GRAY_LIGHT : L_GRAY_DARK).forEach((v, i) => {
    vars[`gray-${STEPS[i]}`] = v
  })
  for (const h of HUES) {
    const scaled = { ...h, cMax: h.cMax * chromaScale }
    ramp(scaled, lTrack, cTrack, biasScale).forEach((v, i) => {
      vars[`${h.name}-${STEPS[i]}`] = v
    })
  }
  return vars
}

/* Canvas and surface swap between modes, so a token that only clears on one
   of them fails the moment a card moves onto the page background. */
const grounds = (mode) =>
  mode === "light"
    ? { canvas: "gray-2", surface: "gray-1" }
    : { canvas: "gray-1", surface: "gray-2" }

function checks(mode) {
  const g = grounds(mode)
  const out = []
  const onBoth = (label, fg, floor) => {
    out.push({ label: `${label} on canvas`, fg, bg: g.canvas, floor })
    out.push({ label: `${label} on surface`, fg, bg: g.surface, floor })
  }

  /* Chart series are large labelled areas, not bare marks — see
     docs/colour-roles.md. They are deliberately not held to the 3:1 bare-mark
     floor; what they owe is separation from each other, which dispersion
     order provides by construction. */

  /* Neutral text. The backbone carries almost all the reading. */
  onBoth("gray-10 (body)", "gray-10", 7)
  onBoth("gray-9 (muted)", "gray-9", 4.5)
  onBoth("gray-8 (subtle)", "gray-8", 3)

  for (const h of HUES.map((x) => x.name)) {
    /* Status chip: label on its own tinted ground. Text floor. */
    out.push({
      label: `${h}-9 text on ${h}-3`,
      fg: `${h}-9`,
      bg: `${h}-3`,
      floor: 4.5,
    })
    /* Stat tile, tint variant: glyph on tinted ground. A glyph is a mark
       wherever it sits, so it takes the mark step in both modes. */
    out.push({
      label: `${h} glyph on ${h}-3`,
      fg: `${h}-${MARK_STEP(mode)}`,
      bg: `${h}-3`,
      floor: 3,
    })
    /* Bare marks — a mark with no label beside it, carrying its meaning
       alone. This is what --{hue}-mark exists for. Mode-dependent step, because a saturated warm hue
       cannot be dark enough at step 9 to clear 3:1 on white.

       A filled tile is deliberately NOT checked here. It is a container, not
       a mark: the label beside it carries the meaning and the glyph inside it
       is legible by construction. Holding it to a mark's floor is what turned
       amber into gold. */
    onBoth(`${h} mark (step ${MARK_STEP(mode)})`, `${h}-${MARK_STEP(mode)}`, 3)
    /* The glyph on a filled tile is covered by the on-solid guarantee below,
       which is checked per hue against the real computed text colour. */
    /* Chip border has to stay visible without becoming a line. */
    out.push({
      label: `${h}-6 border on ${g.surface}`,
      fg: `${h}-6`,
      bg: g.surface,
      floor: 1.15,
    })
  }
  return out
}

/** The generator picks near-white or near-black for text on a solid. */
const ON_SOLID = [
  { name: "white", lum: relLuminance(1, 0, 0) },
  { name: "near-black", lum: relLuminance(0.18, 0, 0) },
]

function run(chromaScale, { quiet = false } = {}) {
  const failures = []
  let total = 0

  for (const mode of ["light", "dark"]) {
    const vars = build(mode, chromaScale)
    for (const c of checks(mode)) {
      total++
      const r = contrast(lum(vars[c.fg]), lum(vars[c.bg]))
      if (r < c.floor) {
        failures.push({ mode, ...c, ratio: +r.toFixed(2) })
      }
    }
    /* Deviation D6: only the state hues carry the on-solid guarantee. Blue,
       indigo, purple and pink sit in a lightness dead zone where neither
       near-black nor white clears 4.5:1 against their solid — that is a
       property of colour, and those hues are never used as a text ground. */
    for (const h of HUES.filter((x) => TEXT_BEARING.has(x.name))) {
      total++
      const solid = lum(vars[`${h.name}-8`])
      const best = Math.max(...ON_SOLID.map((o) => contrast(o.lum, solid)))
      if (best < 4.5) {
        failures.push({
          mode,
          label: `${h.name}-on-solid on ${h.name}-8`,
          floor: 4.5,
          ratio: +best.toFixed(2),
        })
      }
    }
  }

  if (!quiet) {
    console.log(`\nchroma x${chromaScale.toFixed(2)} — ${total} pairings`)
    const byMode = { light: 0, dark: 0 }
    for (const f of failures) byMode[f.mode]++
    console.log(`  light: ${byMode.light}   dark: ${byMode.dark}`)
    if (!failures.length) {
      console.log("  PASS — every floor holds\n")
    } else {
      console.log(`  ${failures.length} breach(es):`)
      for (const f of failures.slice(0, 60)) {
        console.log(
          `    [${f.mode}] ${f.label.padEnd(34)} ${String(f.ratio).padStart(6)} < ${f.floor}`
        )
      }
      if (failures.length > 60) console.log(`    …and ${failures.length - 60} more`)
      console.log("")
    }
  }
  return { total, failures }
}

if (SWEEP) {
  console.log("\nchroma sweep — where do the floors break?\n")
  for (let s = 1.0; s <= 2.01; s += 0.1) {
    const { total, failures } = run(s, { quiet: true })
    const worst = failures.length
      ? failures.reduce((a, b) => (a.ratio < b.ratio ? a : b))
      : null
    console.log(
      `  x${s.toFixed(2)}  ${String(failures.length).padStart(3)} / ${total} breaches` +
        (worst ? `   worst: ${worst.label} @ ${worst.ratio}` : "   all floors hold")
    )
  }
  console.log("")
} else {
  const { failures } = run(Number(arg("chroma", String(CHROMA))))
  if (failures.length) process.exit(1)
}
