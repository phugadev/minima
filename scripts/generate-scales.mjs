/**
 * Minima — colour scale generator
 *
 * Emits `src/ramps.css`: thirteen 12-step ramps in OKLCH, light and dark.
 *
 * Step semantics are Radix's, adopted verbatim so the vocabulary matches what
 * the rest of the ecosystem already means by a step number:
 *
 *    1  app background          7  element border / focus ring
 *    2  subtle background       8  hovered element border
 *    3  element background      9  SOLID
 *    4  hovered element bg     10  hovered solid
 *    5  active / selected bg   11  low-contrast text  (>= 4.5:1 on 1/2)
 *    6  subtle border          12  high-contrast text
 *
 * Why OKLCH: lightness is perceptual, so a step number weighs the same in
 * every hue. Values are unclamped, so saturated steps render wide on a P3
 * display and are gamut-mapped down elsewhere — one palette, two gamuts.
 *
 * Run: node scripts/generate-scales.mjs
 */

// (no writes here any more — see the throw below)

/* Ten steps, in five pairs: two backgrounds, two element fills, two borders,
   the solid, and two text levels. Reduced from twelve by dropping Radix's
   "hovered border" and "hovered solid" — both were unused here and both are
   derivable from the step below them, whereas every remaining step is
   referenced by the semantic layer or a recipe. */
export const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/* Lightness tracks. Chromatic hues and gray differ at the ends: gray has to
   reach true text-black, chromatic hues must not. */
/* Step 9 sits at 0.490 rather than 0.505 to pay for the chroma above it.
   Green, teal and cyan gain luminance as they gain chroma, so saturating the
   text step costs contrast against the pale tinted ground a chip puts behind
   it — teal is the binding case at 4.26:1. Fifteen thousandths of lightness
   buys it back (4.57:1) and costs almost no saturation. */
export const L_LIGHT = [
  0.993, 0.977, 0.955, 0.936, 0.914, 0.886, 0.848, 0.600, 0.490, 0.360,
]
export const L_DARK = [
  0.155, 0.195, 0.245, 0.280, 0.315, 0.360, 0.420, 0.620, 0.780, 0.925,
]

export const L_GRAY_LIGHT = [
  0.993, 0.980, 0.956, 0.938, 0.918, 0.892, 0.858, 0.640, 0.520, 0.180,
]
/* A reading gray, and the ramp has no room for it: the light track jumps 0.340
   in lightness between step 9 and step 10 while every other gap is about 0.03.
   That is because both text steps are calibrated for INTERFACE text — muted
   against strong — and neither is calibrated for a paragraph.

   Body prose set at the strong step measures ~17.7:1 on the page, which is not
   a virtue. It is a glare, and it leaves headings and bold with nowhere to go:
   emphasis has to come entirely from size and weight because the tone is
   already at maximum. Lifting the body a little gives the hierarchy somewhere
   to live and is easier to read for more than a paragraph.

   0.380 lands on #424242 in light, which is where sites that do this well tend
   to end up. Dark takes 0.880 rather than 0.960 for the mirror reason: pure
   white on near-black halates. */
export const L_GRAY_READING = { light: 0.38, dark: 0.88 }

export const L_GRAY_DARK = [
  0.145, 0.185, 0.225, 0.255, 0.285, 0.325, 0.375, 0.600, 0.770, 0.960,
]

/* Relative chroma per step — near-zero at the page backgrounds, peaking at
   the solid, easing back for text so coloured text never turns garish. */
/* Step 9 carries 1.15, above the step-8 solid, and that is deliberate.
   A hue at L 0.505 cannot hold the chroma it holds at its peak — the gamut
   simply narrows — so asking for more here buys real saturation rather than
   clipping. At 0.92 amber's text sat at C 0.13 and read as mud; at 1.15 it is
   C 0.17 and still clears 4.5:1 on the page. Measured, not guessed:
   node scripts/audit-ramps.mjs. */
export const C_LIGHT = [
  0.05, 0.10, 0.18, 0.26, 0.34, 0.42, 0.52, 1.00, 1.15, 0.95,
]
/* Dark has far more headroom than light — coloured text on a near-black page
   measures 8:1 upward against a 4.5 floor — so step 9 takes 1.20 here. Amber
   text goes C 0.17 to C 0.25 and still measures 9.2:1. */
export const C_DARK = [
  0.10, 0.16, 0.26, 0.34, 0.42, 0.50, 0.60, 1.00, 1.20, 1.00,
]

/* Lightness bias applies to the solid steps only (9, 10).
   A hue cannot stay itself at an arbitrary lightness — amber at blue's
   lightness is brown. Radix's own step 9 varies in lightness by hue for
   exactly this reason. Steps 11/12 take no bias, so accessible amber text
   is — correctly — brown. */
export const BIAS_WEIGHT = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0]

/**
 * hue     OKLCH hue angle
 * cMax    peak chroma at step 9. Deliberately past the sRGB boundary for
 *         several hues: on a P3 display these render wide and vivid, and
 *         the browser gamut-maps them down on an sRGB one.
 * lPeak   the lightness at which the hue can actually hold cMax
 * lBias   lightness added at the solid steps (see BIAS_WEIGHT)
 *
 * The text colour for steps 9/10 is NOT declared here — it is computed from
 * the resulting solid by pickOnSolid(), because a hand-set flag is exactly
 * the kind of thing that silently stops being true when a curve is retuned.
 */
/**
 * Global chroma scale.
 *
 * Measured rather than chosen. `node scripts/audit-ramps.mjs --sweep` shows
 * that pushing chroma barely moves contrast: dark mode holds every floor to
 * x1.5, and light mode's breaches are flat across the whole range because they
 * are caused by LIGHTNESS, not saturation — yellow's solid sits at 1.6:1
 * against a white page at any chroma you like.
 *
 * So saturation is close to free. 1.15 is the ceiling, and it is not a taste
 * call either: at 1.20 the generator refuses to build, because red's solid
 * drops to 4.83:1 against its best text colour and the on-solid guarantee
 * needs 4.85. Red is text-bearing — the solid Stat tile puts a glyph on it —
 * so that guarantee is load-bearing rather than decorative.
 *
 * The palette is therefore as saturated as it can be while every filled
 * surface can still carry a label. That is a measured limit, not a preference.
 */
export const CHROMA = 1.15

/* Ten scales: gray plus nine hues.
 *
 * Pruned from twelve. Four are fixed by meaning — red danger, amber warning,
 * green success, blue identity — and the remaining five were chosen to
 * maximise the minimum separation between any pair, which lands at 25°.
 *
 * Dropped: yellow and lime, which sit between amber and green and are the
 * worst contrast performers in the set (yellow's solid measures 1.64:1 on a
 * white page at any chroma), and indigo, which sat 19° from blue — the
 * closest pair in the whole palette and the reason two chart series were
 * hard to tell apart.
 */
export const HUES = [
  { name: "red",    hue:  25, cMax: 0.225, lPeak: 0.58, lBias: -0.07  },
  { name: "orange", hue:  50, cMax: 0.200, lPeak: 0.68, lBias:  0.07, onSolid: "dark"  },
  { name: "amber",  hue:  78, cMax: 0.180, lPeak: 0.80, lBias:  0.16, onSolid: "dark"  },
  { name: "green",  hue: 150, cMax: 0.215, lPeak: 0.72, lBias:  0.07, onSolid: "dark"  },
  { name: "teal",   hue: 180, cMax: 0.165, lPeak: 0.74, lBias:  0.06, onSolid: "dark"  },
  { name: "cyan",   hue: 225, cMax: 0.175, lPeak: 0.70, lBias:  0.03 },
  { name: "blue",   hue: 258, cMax: 0.245, lPeak: 0.56, lBias: -0.01 },
  { name: "purple", hue: 302, cMax: 0.265, lPeak: 0.55, lBias:  0.00 },
  { name: "pink",   hue: 353, cMax: 0.245, lPeak: 0.62, lBias:  0.02 },
]

/* How much chroma a hue can carry at a given lightness. A broad gaussian
   around the hue's peak: keeps pale steps clean and dark steps from clipping
   into mud, without flattening the mid-range. */
const holdable = (l, lPeak) => Math.exp(-(((l - lPeak) / 0.50) ** 2))

/* ── Self-checking ─────────────────────────────────────────────────────────
   OKLCh → linear sRGB → WCAG relative luminance, so the generator can verify
   its own contrast rather than emitting a palette and hoping. Out-of-gamut
   values are clamped here, which is cruder than the browser's gamut mapping —
   so the threshold below carries headroom, and scripts/audit-contrast.mjs
   remains the authority. */
export function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, sC = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * sC,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * sC,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * sC,
  ].map((v) => Math.min(1, Math.max(0, v)))
}

export const relLuminance = (L, C, h) => {
  const [r, g, b] = oklchToLinearSrgb(L, C, h)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrast = (a, b) => {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/* The two candidates for text sitting on a solid. */
const ON_SOLID = {
  light: { css: "oklch(1 0 0)", lum: 1 },
  dark: { css: "oklch(0.18 0 0)", lum: relLuminance(0.18, 0, 0) },
}

/* Charter 8.1 floor for text, plus headroom for the clamping above. */
const ON_SOLID_FLOOR = 4.5
const ON_SOLID_MARGIN = 0.35

/* The hues the semantic layer actually pairs with text, via {tone}-foreground.
   Only these carry the AA guarantee, and the generator refuses to emit a
   palette that breaks it.

   The others are deliberately exempt. A saturated hue around L 0.60 sits in a
   dead zone where neither white nor near-black reaches 4.5:1 — that is a
   property of colour, not a bug — and forcing every hue out of it would cost
   the whole palette its punch to protect a pairing Minima never makes. Blue,
   indigo, purple and pink are used as links, rings, tints and data marks;
   none of those put small text on a step 9 fill. */
export const TEXT_BEARING = new Set(["green", "amber", "red", "cyan"])

/**
 * Pick the readable text colour for a hue's solid step, by measurement rather
 * than by taste. Throws if neither candidate clears the floor: a palette that
 * cannot carry a legible button label is not one Minima ships (Charter 8.2).
 */
function pickOnSolid(hue, lTrack, cTrack, biasScale, step = 8) {
  const i = STEPS.indexOf(step)
  const scale = (hue.lBias ?? 0) > 0 ? biasScale : 1
  const l = Math.min(0.99, Math.max(0.02, lTrack[i] + (hue.lBias ?? 0) * BIAS_WEIGHT[i] * scale))
  const c = hue.cMax * cTrack[i] * holdable(l, hue.lPeak)
  const solid = relLuminance(l, c, hue.hue)

  const scored = Object.entries(ON_SOLID)
    .map(([k, v]) => ({ key: k, css: v.css, ratio: contrast(v.lum, solid) }))
    .sort((a, b) => b.ratio - a.ratio)

  const best = scored[0]
  if (TEXT_BEARING.has(hue.name) && best.ratio < ON_SOLID_FLOOR + ON_SOLID_MARGIN) {
    throw new Error(
      `${hue.name}: step ${step} cannot carry legible text — best is ${best.key} at ` +
        `${best.ratio.toFixed(2)}:1, floor is ${ON_SOLID_FLOOR} plus a ` +
        `${ON_SOLID_MARGIN} margin (${ON_SOLID_FLOOR + ON_SOLID_MARGIN}). ` +
        `Lower its lBias or cMax until it clears. (Charter 8.1)`
    )
  }
  return best
}

const r3 = (n) => Number(n.toFixed(3))
const r4 = (n) => Number(n.toFixed(4))

export function ramp({ hue, cMax, lPeak, lBias = 0 }, lTrack, cTrack, biasScale = 1) {
  return lTrack.map((l0, i) => {
        /* The dark-mode scale softens the LIGHTENING of warm hues, whose solids
       already sit high on the dark track. A hue biased downward is being
       deepened to stay legible under text, and needs no softening. */
    const scale = lBias > 0 ? biasScale : 1
    const l = Math.min(0.99, Math.max(0.02, l0 + lBias * BIAS_WEIGHT[i] * scale))
    const c = cMax * cTrack[i] * holdable(l, lPeak)
    return `oklch(${r3(l)} ${r4(c)} ${hue})`
  })
}

export function grayRamp(lTrack) {
  return lTrack.map((l) => `oklch(${r3(l)} 0 0)`)
}

/**
 * Which step a MARK uses — a dot, a filled tile, a data point. Anything that
 * is a solid shape rather than text or a background.
 *
 * Mode-dependent, and it has to be. Step 9 is the solid, and in dark mode it
 * sits comfortably above the page. In light mode it does not: measured against
 * a white canvas, yellow's solid is 1.64:1, lime 1.79, amber 2.07, green 2.53 —
 * all under the 3:1 a non-text mark needs. That is a property of those hues,
 * not a tuning error: a saturated yellow simply cannot be dark. Pushing it
 * down until it clears would stop it being yellow.
 *
 * So light marks come from step 9 instead, which is darker while still
 * carrying the hue. This is the one place the ramps are read differently per
 * mode, and it is deliberate — the alternative is either an illegible mark or
 * a palette with no yellow in it.
 */
export const MARK_STEP = (mode) => (mode === "light" ? 9 : 8)

/** Every ramp value for one mode, as a flat `{ "gray-1": "oklch(…)" }` map. */
export function rampVars(mode) {
  const light = mode === "light"
  /* Dark solids sit higher on the lightness track already, so they need less
     of the warm-hue bias than light solids do. */
  const biasScale = light ? 1 : 0.6
  const vars = {}
  const grayTrack = light ? L_GRAY_LIGHT : L_GRAY_DARK
  grayRamp(grayTrack).forEach((v, i) => {
    vars[`gray-${STEPS[i]}`] = v
  })

  /* Gray needs an on-solid too, and for a long time it did not have one while
     build-ramps emitted --color-gray-on-solid regardless. The variable was
     undefined, so a label on a gray solid silently inherited the page
     foreground and measured 3.53:1 in dark — invisible to every audit, because
     no audit knew the token was supposed to exist.
     Gray is deliberately NOT in TEXT_BEARING: its best candidate is 4.76:1 in
     dark, over the 4.5 floor but under the 4.85 margin the guaranteed hues
     carry, and buying that margin means moving the solid step for a pairing
     nothing currently makes. Above the floor and honest about it. */
  const grayish = { name: "gray", hue: 0, cMax: 0, lPeak: 0.5, lBias: 0 }
  const cTrack = light ? C_LIGHT : C_DARK
  vars["gray-reading"] = `oklch(${r3(L_GRAY_READING[mode])} 0 0)`
  vars["gray-on-solid"] = pickOnSolid(grayish, grayTrack, cTrack, biasScale).css
  vars["gray-mark"] = vars[`gray-${MARK_STEP(mode)}`]
  vars["gray-on-mark"] = pickOnSolid(grayish, grayTrack, cTrack, biasScale, MARK_STEP(mode)).css
  for (const h of HUES) {
    const hue = { ...h, cMax: h.cMax * CHROMA }
    ramp(hue, light ? L_LIGHT : L_DARK, light ? C_LIGHT : C_DARK, biasScale).forEach(
      (v, i) => {
        vars[`${h.name}-${STEPS[i]}`] = v
      }
    )
    vars[`${h.name}-on-solid`] = pickOnSolid(
      hue,
      light ? L_LIGHT : L_DARK,
      light ? C_LIGHT : C_DARK,
      biasScale
    ).css

    /* The mark, and the text that sits on it. See MARK_STEP below. */
    vars[`${h.name}-mark`] = vars[`${h.name}-${MARK_STEP(mode)}`]
    vars[`${h.name}-on-mark`] = pickOnSolid(
      hue,
      light ? L_LIGHT : L_DARK,
      light ? C_LIGHT : C_DARK,
      biasScale,
      MARK_STEP(mode)
    ).css
  }
  return vars
}

const STEP_LABEL = {
  1: "app background",
  2: "subtle background",
  3: "element background",
  4: "hovered element background",
  5: "active / selected background",
  6: "subtle border",
  7: "element border / focus ring",
  8: "hovered element border",
  9: "SOLID",
  10: "hovered solid",
  11: "low-contrast text",
  12: "high-contrast text",
}

function block(mode) {
  const vars = rampVars(mode)
  const names = ["gray", ...HUES.map((h) => h.name)]
  const lines = []

  for (const name of names) {
    lines.push(
      `  /* ── ${name} ${"─".repeat(Math.max(0, 64 - name.length))} */`
    )
    for (const s of STEPS) {
      const key = `${name}-${s}`
      lines.push(`  --${key}:${" ".repeat(Math.max(1, 14 - key.length))}${vars[key]};`)
    }
    if (name !== "gray") {
      lines.push(`  --${name}-on-solid: ${vars[`${name}-on-solid`]};`)
    }
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

const legend = STEPS.map(
  (s) => `     ${String(s).padStart(2)}  ${STEP_LABEL[s]}`
).join("\n")

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = `/* ═══════════════════════════════════════════════════════════════════════════
     MINIMA — SPECTRAL RAMP
     GENERATED FILE — edit scripts/generate-scales.mjs and re-run:
         node scripts/generate-scales.mjs

     Thirteen ramps × twelve steps, in OKLCH. Step semantics are Radix's,
     adopted verbatim rather than invented:

  ${legend}

     Steps 1–8 and 11–12 sit on a shared lightness track, so a border or a text
     colour weighs the same in every hue. Steps 9–10 carry a per-hue lightness
     bias, because amber at blue's lightness is brown.

     This is raw material, not a licence. Minima stays neutral-dominant: the
     spectral ramps exist so that the state, identity and data tokens have
     somewhere principled to come from. Reaching past those tokens into a raw
     ramp is the exception, and it should feel like one.
     ═══════════════════════════════════════════════════════════════════════════ */

  :root {
  ${block("light")}
  }

  .dark {
  ${block("dark")}
  }
  `

  /* This entry point is superseded and it was not harmless.

     `node scripts/generate-scales.mjs` wrote src/ramps.css in an older shape —
     thirteen ramps of twelve steps under a bare :root, with no role names and
     no alpha rungs — silently replacing the ten-by-ten file build-ramps.mjs
     actually emits and that everything downstream reads BY ROLE. Nothing called
     it, its own header no longer described its output, and it sat one stray
     command away from replacing the source of the whole system.

     The block above is left standing rather than deleted: it is the reference
     for what the raw ramp looks like, and cutting it out by hand went wrong
     twice — the template literal is full of braces, so a brace matcher walks
     straight past the end of the function. A throw is one line and cannot
     misfire. */
  void out
  throw new Error(
    "generate-scales.mjs is the maths, not the generator — run scripts/build-ramps.mjs.\n" +
      "This entry point emitted a superseded ramp shape and would overwrite src/ramps.css with it."
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ALPHA
   ═══════════════════════════════════════════════════════════════════════════

   Every step above is opaque, and an opaque colour REPLACES whatever is behind
   it. That is correct for a page, a card, a solid button. It is wrong the
   moment you do not know what is behind — a hover state on a row that might be
   striped, a hairline crossing a photograph, a menu over a chart. There the
   colour has to MODIFY its ground rather than erase it.

   So each translucent value is solved rather than chosen: given the opaque
   step and a reference ground, find the (colour, alpha) pair that composites
   to exactly that step. The reference is pure white in light mode and pure
   black in dark — the same convention Radix uses, and the only one with no
   degenerate case (calibrating against a ramp step makes that step's own tint
   solve to zero alpha, i.e. to nothing).

   The guarantee is therefore precise: over paper, a tint is its opaque twin.
   Over anything else it is the same veil, doing the same amount of darkening,
   which is what you actually wanted.

   Two consequences worth stating rather than discovering:

   1. Only six rungs get an alpha. Backgrounds, fills and borders sit on top of
      things; solids and text do not. Translucent text is a bug, and a
      translucent solid stops being able to carry a label — the on-solid
      guarantee is computed against an opaque colour and quietly stops holding.

   2. A veil solved for light mode is dark. Over a dark photograph it will
      disappear, and no amount of tuning fixes that — it is the same fact as
      "you cannot have a warm hue that is saturated, dark and still itself".
      Content of genuinely unknown luminance needs a scrim under it, not a
      cleverer hairline.
   ────────────────────────────────────────────────────────────────────────── */

/* Named for the job, not mirrored from the opaque role, because the job is
   different. `fill` replaces, `tint` veils. Six rungs, mapped to the opaque
   steps they reproduce. */
export const ALPHA_ROLES = {
  "tint-subtle": 2,
  tint: 3,
  "tint-hover": 4,
  "tint-active": 5,
  hairline: 6,
  "hairline-strong": 7,
}

/* Paper and ink. Compositing happens in gamma-encoded sRGB, so everything
   below does too — not in OKLCH, and not in linear light. */
export const REFERENCE = (mode) => (mode === "light" ? [1, 1, 1] : [0, 0, 0])

const encode = (v) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

/** OKLCH → gamma-encoded sRGB, clamped. Alpha values live in sRGB by
    definition: that is the space the browser composites in. */
export const srgb = (L, C, h) => oklchToLinearSrgb(L, C, h).map(encode)

export const composite = (fg, a, bg) => fg.map((c, i) => a * c + (1 - a) * bg[i])

export const luminanceOf = ([r, g, b]) =>
  0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b)

/**
 * The minimum alpha that can reproduce `target` over `bg`, and the colour to
 * pair it with.
 *
 * Minimum, because that is the alpha at which the solved colour sits exactly
 * on the gamut boundary — pure black over white, pure white over black. Any
 * more alpha would need a colour that is less than black, and any less would
 * need one that is more. It is also the value that degrades most gracefully:
 * the thinnest veil that does the job disturbs the least of what is under it.
 */
export function solveAlpha(target, bg) {
  let a = 0
  for (let i = 0; i < 3; i++) {
    const t = target[i]
    const b = bg[i]
    if (b > 0) a = Math.max(a, (b - t) / b)
    if (b < 1) a = Math.max(a, (t - b) / (1 - b))
  }
  /* Round UP, so the solved colour lands just inside the gamut rather than on
     its edge, and so the emitted percentage is exact rather than a value the
     browser has to re-round. */
  a = Math.min(1, Math.max(0.001, Math.ceil(a * 1000) / 1000))
  const rgb = target.map((t, i) =>
    Math.round(Math.min(1, Math.max(0, (t - (1 - a) * bg[i]) / a)) * 255)
  )
  return { rgb, a }
}

export const alphaCss = ({ rgb, a }) =>
  `rgb(${rgb.join(" ")} / ${Number((a * 100).toFixed(1))}%)`

/** Every translucent value for one mode, as a flat `{ "gray-tint": "rgb(…)" }`
    map, keyed the same way rampVars() is. */
export function alphaVars(mode) {
  const light = mode === "light"
  const biasScale = light ? 1 : 0.6
  const bg = REFERENCE(mode)
  const vars = {}

  const emit = (name, steps) => {
    for (const [role, step] of Object.entries(ALPHA_ROLES)) {
      const i = STEPS.indexOf(step)
      vars[`${name}-${role}`] = alphaCss(solveAlpha(steps[i], bg))
    }
  }

  emit(
    "gray",
    (light ? L_GRAY_LIGHT : L_GRAY_DARK).map((l) => srgb(l, 0, 0))
  )

  for (const h of HUES) {
    const hue = { ...h, cMax: h.cMax * CHROMA }
    const lTrack = light ? L_LIGHT : L_DARK
    const cTrack = light ? C_LIGHT : C_DARK
    const steps = lTrack.map((l0, i) => {
      const scale = hue.lBias > 0 ? biasScale : 1
      const l = Math.min(0.99, Math.max(0.02, l0 + hue.lBias * BIAS_WEIGHT[i] * scale))
      return srgb(l, hue.cMax * cTrack[i] * holdable(l, hue.lPeak), hue.hue)
    })
    emit(h.name, steps)
  }
  return vars
}

/**
 * The scrim behind a dialog. Not solved — chosen, and deliberately not
 * symmetric between modes.
 *
 * In light mode a scrim does the whole job: it drops the page far enough that
 * a white surface floats clear of it. In dark mode it cannot, and pretending
 * otherwise is how dark dialogs end up looking flat. Near-black over near-black
 * has nowhere to go — the page is already at the bottom of the range, so the
 * separation has to come from the surface being LIGHTER than the page, plus a
 * border. The scrim's remaining job there is only to quiet busy content, which
 * needs more of it, not less.
 */
export const SCRIM = { light: 0.45, dark: 0.65 }
