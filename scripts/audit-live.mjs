/**
 * Live audit — the two things that can only be checked in a real browser.
 *
 * 1. REDUCED MOTION, under actual media emulation rather than by reading the
 *    stylesheet. Every previous check on this only proved the rules exist in
 *    the CSS; it never proved a browser reporting `prefers-reduced-motion:
 *    reduce` actually ends up with no motion. That is the gap this closes, and
 *    it mattered because this is the one rule with a person behind it.
 *
 *    It asserts in BOTH directions. A test that only checks "everything is
 *    1ms under reduce" passes perfectly on a page with no animation at all,
 *    which is the same shape as the no-op checks that have already slipped
 *    through here twice. So it first proves motion EXISTS without the
 *    preference, then proves it is gone with it.
 *
 * 2. FOCUS RINGS are actually drawn. audit-state.mjs proves the ring colour
 *    clears 3:1 on every surface; it cannot prove the outline renders. An
 *    undefined custom property makes the whole declaration invalid and CSS
 *    drops it in silence — a control with no ring at all, which measures as
 *    perfectly compliant in any token-level check.
 *
 * Unlike every other runner here, this one needs a REAL APP — there is nothing
 * to render in a registry repo. Point it at any project that has installed the
 * theme:
 *
 *   URL=http://localhost:3000 npm run audit:live
 */
import { chromium } from "playwright"

const URL = process.env.URL ?? "http://localhost:3000"
const failures = []
const fail = (label, detail) => failures.push({ label, detail })
let checked = 0

const durations = async (page) =>
  page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el)
      const ms = (v) =>
        Math.max(0, ...String(v).split(",").map((d) => (d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000) || 0))
      out.push(Math.max(ms(s.transitionDuration), ms(s.animationDuration)))
    }
    return out
  })

const browser = await chromium.launch()

/* ── Motion exists ───────────────────────────────────────────────────────── */
{
  const ctx = await browser.newContext({ reducedMotion: "no-preference" })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: "networkidle" })
  const d = await durations(page)
  const moving = d.filter((x) => x > 1).length
  checked++
  console.log(`no-preference   ${moving} of ${d.length} elements animate, longest ${Math.max(...d)}ms`)
  if (moving === 0)
    fail("no-preference", "nothing on the page animates — the reduce test below would pass vacuously")
  if (Math.max(...d) > 400) fail("no-preference", `longest duration ${Math.max(...d)}ms exceeds the 400ms ceiling`)
  await ctx.close()
}

/* ── And is gone when it is not wanted ───────────────────────────────────── */
{
  const ctx = await browser.newContext({ reducedMotion: "reduce" })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: "networkidle" })
  checked++
  const matched = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  if (!matched) fail("reduce", "the browser is not reporting the preference — emulation did not take")
  const d = await durations(page)
  const still = d.filter((x) => x > 1).length
  console.log(`reduce          ${still} of ${d.length} elements still animate, longest ${Math.max(...d)}ms`)
  if (still > 0) fail("reduce", `${still} element(s) still animate, longest ${Math.max(...d)}ms`)
  await ctx.close()
}

/* ── Focus rings are drawn ───────────────────────────────────────────────── */
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: "networkidle" })
  /* The theme is applied in an effect, and --focus lives behind it. Tabbing
     before that lands measures the fallback, not the ring. */
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-theme"))
  const seen = []
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab")
    /* Read on the NEXT frame, not this one. The ring must be correct
       immediately — that is the assertion — but a paint has to happen first
       for getComputedStyle to report what was painted. */
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const ring = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      /* Next's dev-tools overlay is focusable and is not ours to style. */
      if (el.closest("nextjs-portal") || el.tagName.includes("-")) return { skip: el.tagName }
      const s = getComputedStyle(el)
      /* Resolve both through the same canvas so they are comparable no matter
         which colour syntax the browser serialises them in. */
      const cv = document.createElement("canvas")
      cv.width = cv.height = 2
      const cx = cv.getContext("2d", { willReadFrequently: true })
      const px = (css, ground) => {
        cx.clearRect(0, 0, 2, 2)
        cx.fillStyle = ground
        cx.fillRect(0, 0, 2, 2)
        cx.fillStyle = css
        cx.fillRect(0, 0, 2, 2)
        const d = cx.getImageData(1, 1, 1, 1).data
        return [d[0], d[1], d[2]].join(",")
      }
      const onBlack = px(s.outlineColor, "#000")
      const onWhite = px(s.outlineColor, "#fff")
      const alpha = 1 - (Number(onWhite.split(",")[0]) - Number(onBlack.split(",")[0])) / 255
      const token = getComputedStyle(document.documentElement).getPropertyValue("--focus").trim()
      return {
        tag: el.tagName,
        label: (el.textContent || "").trim().slice(0, 18),
        width: parseFloat(s.outlineWidth) || 0,
        style: s.outlineStyle,
        colour: onBlack,
        focusToken: token ? px(token, "#000") : onBlack,
        alpha,
        offset: parseFloat(s.outlineOffset) || 0,
      }
    })
    if (!ring) continue
    if (ring.skip) continue
    checked++
    seen.push(ring)
    if (ring.width < 1 || ring.style === "none")
      fail("focus", `${ring.tag} focuses with no visible outline (${ring.width}px ${ring.style})`)
    if (ring.offset < 1) fail("focus", `${ring.tag} has no outline offset — the ring has no gap to contrast with`)
    /* The rendered colour has to BE --focus. A translucent ring measures worse
       than the opaque one audit-state.mjs checks, and that mismatch is how a
       token-level pass coexists with a real-world failure: shadcn's base rule
       was overriding the colour while leaving the geometry intact. */
    if (ring.alpha < 0.999)
      fail("focus", `${ring.tag} ring is translucent (alpha ${ring.alpha.toFixed(3)}) — audit-state measures it opaque`)
    if (ring.colour !== ring.focusToken)
      fail("focus", `${ring.tag}${ring.label ? ` "${ring.label}"` : ""} ring is rgb(${ring.colour}), but --focus resolves to rgb(${ring.focusToken})`)
  }
  console.log(
    `focus           ${seen.length} controls tabbed, all ${seen[0]?.width}px offset ${seen[0]?.offset}px, rgb(${seen[0]?.colour}) alpha ${seen[0]?.alpha?.toFixed(2)}`
  )
  await ctx.close()
}

await browser.close()
console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.label.padEnd(16)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — motion is real, reduced motion removes it, every control shows a ring\n")
