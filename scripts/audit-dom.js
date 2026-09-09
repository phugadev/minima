/**
 * Component-level contrast sweep.
 *
 * The other four audits check the ramps and the tokens. This one checks what
 * actually rendered, and it exists because the token audits proved sound while
 * a shipped button variant sat at 3.33:1 — the tokens were fine, the pairing a
 * component chose was not. That is a whole class of defect the others are
 * structurally unable to see.
 *
 * It has no Node runner because it needs a real layout and a real cascade.
 * Paste it into a devtools console, or inject it from Playwright, on each
 * screen and in each mode:
 *
 *     __minimaSweep()   // -> { checked, failing, fails: [...] }
 *
 * Two things it taught us about measuring, both of which cost a wrong answer:
 *
 *   1. getComputedStyle returns `lab(...)` here, because the tokens are OKLCH.
 *      Parsing it with a number regex reads Lab lightness as a red channel and
 *      reports every element as failing. Colours are resolved through a canvas
 *      instead, so the browser's own engine does the conversion.
 *
 *   2. After a theme toggle the values are stale for roughly a second. A sweep
 *      run 320ms later reported seven failures that did not exist. Settle for
 *      at least a second before believing anything.
 */
window.__minimaSweep = function () {
  const cv = document.createElement("canvas")
  cv.width = cv.height = 2
  const cx = cv.getContext("2d", { willReadFrequently: true })

  /** Any CSS colour string -> {r,g,b,a}, using the browser's own engine. */
  const rgba = (css) => {
    const draw = (ground) => {
      cx.clearRect(0, 0, 2, 2)
      cx.fillStyle = ground
      cx.fillRect(0, 0, 2, 2)
      cx.fillStyle = css
      cx.fillRect(0, 0, 2, 2)
      const d = cx.getImageData(1, 1, 1, 1).data
      return [d[0], d[1], d[2]]
    }
    const onBlack = draw("#000")
    const onWhite = draw("#fff")
    const a = 1 - (onWhite[0] - onBlack[0]) / 255
    if (a <= 0.002) return { r: 0, g: 0, b: 0, a: 0 }
    return { r: onBlack[0] / a, g: onBlack[1] / a, b: onBlack[2] / a, a }
  }

  const over = (f, b) => ({
    r: f.a * f.r + (1 - f.a) * b.r,
    g: f.a * f.g + (1 - f.a) * b.g,
    b: f.a * f.b + (1 - f.a) * b.b,
    a: 1,
  })
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const Y = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a, b) => {
    const [hi, lo] = Y(a) > Y(b) ? [Y(a), Y(b)] : [Y(b), Y(a)]
    return (hi + 0.05) / (lo + 0.05)
  }

  /** The real ground under an element: every translucent layer, composited. */
  const groundOf = (el) => {
    const stack = []
    let n = el
    while (n) {
      const c = rgba(getComputedStyle(n).backgroundColor)
      if (c.a > 0) {
        stack.push(c)
        if (c.a >= 0.999) break
      }
      n = n.parentElement
    }
    if (!stack.length || stack[stack.length - 1].a < 0.999) stack.push({ r: 255, g: 255, b: 255, a: 1 })
    let out = stack[stack.length - 1]
    for (let i = stack.length - 2; i >= 0; i--) out = over(stack[i], out)
    return out
  }

  const TEXTY = /^(SPAN|P|H1|H2|H3|H4|H5|H6|DIV|BUTTON|A|LABEL|TD|TH|LI|CODE|STRONG|EM|SUMMARY)$/
  const fails = []
  let checked = 0

  for (const el of document.querySelectorAll("body *")) {
    if (!TEXTY.test(el.tagName)) continue
    /* Only elements with their OWN text, or a container is judged by its
       child's colour and every failure is reported twice. */
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const box = el.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) continue
    const s = getComputedStyle(el)
    if (s.visibility === "hidden" || Number(s.opacity) === 0) continue

    const ground = groundOf(el)
    const fg = over(rgba(s.color), ground)
    const size = parseFloat(s.fontSize)
    const weight = Number(s.fontWeight) || 400
    /* WCAG large text: 24px, or 18.66px when bold. */
    const floor = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5
    const got = ratio(fg, ground)
    checked++
    if (!Number.isFinite(got)) {
      fails.push({ text: el.textContent.trim().slice(0, 30), got: "NOT A NUMBER", floor })
    } else if (got < floor - 0.01) {
      fails.push({
        text: el.textContent.trim().slice(0, 30),
        got: +got.toFixed(2),
        floor,
        size: Math.round(size),
        cls: (el.className || "").toString().slice(0, 50),
      })
    }
  }
  return { checked, failing: fails.length, fails }
}
