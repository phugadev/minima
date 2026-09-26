/**
 * Pages — what a consumer's real pages actually render.
 *
 * audit-ramps proves every PAIRING Minima recommends clears its floor. It
 * cannot prove a consumer only uses those pairings: a quiet text colour on a
 * raised card, a label on a translucent chip, a colour the consumer composed
 * itself. Those are only visible on the page, so this measures the page.
 *
 * For every page, in every mode asked for, at a desktop and a phone width:
 *
 *   contrast   every element with its own text, against the colour actually
 *              painted behind it — translucent layers composited up the
 *              ancestor chain, the element's own opacity included. 4.5:1, or
 *              3:1 for large text. Disabled controls are exempt, as WCAG
 *              1.4.3 exempts inactive components.
 *   overflow   nothing scrolls sideways. A page wider than the phone is the
 *              commonest way a layout breaks and the least likely to be seen
 *              from a desktop.
 *   root       the root font size is the reader's default — see
 *              audit-install.mjs for why every rem depends on it.
 *
 * Mode is set the way a reader sets it, through prefers-color-scheme; a
 * consumer that pins one mode is simply checked in that mode.
 *
 *   URL=http://localhost:3000 PAGES=/,/blog MODES=light,dark npm run audit:pages
 *
 * The contrast check was shown to fail before it was trusted: grey #444 on
 * #0a0a0a (2.03:1) and #ccc under a 90% white layer (1.30:1) both fail.
 */
import { chromium } from "playwright"

const URL = process.env.URL ?? "http://localhost:3000"
const PAGES = (process.env.PAGES ?? "/").split(",")
const MODES = (process.env.MODES ?? "light,dark").split(",")
const WIDTHS = [1280, 390]

const failures = []
let checked = 0

const browser = await chromium.launch()
const blank = await browser.newPage()
const readerRoot = await blank.evaluate(() => getComputedStyle(document.documentElement).fontSize)
await blank.close()

for (const mode of MODES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: mode, reducedMotion: "reduce" })
    const page = await ctx.newPage()
    for (const path of PAGES) {
      const res = await page.goto(URL + path, { waitUntil: "load" })
      /* Scroll the whole page first, so anything revealed on scroll is in
         its final state when it is measured. */
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 40))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(600)

      const r = await page.evaluate(() => {
        const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
        /* The canvas resolves any CSS colour — oklch, color-mix, named — to
           the sRGB the screen will show. */
        const rgba = (c) => {
          cv.clearRect(0, 0, 1, 1)
          cv.fillStyle = "#000"
          cv.fillStyle = c
          cv.fillRect(0, 0, 1, 1)
          const d = cv.getImageData(0, 0, 1, 1).data
          return [d[0], d[1], d[2], d[3] / 255]
        }
        const lum = ([r, g, b]) => {
          const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
        }
        const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
        const pageGround = rgba(getComputedStyle(document.body).backgroundColor)
        const ground = (el) => {
          const layers = []
          for (let e = el; e; e = e.parentElement) {
            const bg = rgba(getComputedStyle(e).backgroundColor)
            if (bg[3] > 0) {
              layers.push(bg)
              if (bg[3] >= 1) break
            }
          }
          let c = pageGround[3] >= 1 ? pageGround : [255, 255, 255, 1]
          for (const l of layers.reverse()) c = over(l, c)
          return c
        }
        const out = []
        for (const el of document.querySelectorAll("body *")) {
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === "hidden" || cs.display === "none") continue
          if (el.closest('[aria-hidden="true"], .sr-only, svg, pre, :disabled, [aria-disabled="true"]')) continue
          const rect = el.getBoundingClientRect()
          if (!rect.width || !rect.height) continue
          const bg = ground(el)
          let fg = rgba(cs.color)
          if (fg[3] < 1) fg = over(fg, bg)
          let opacity = 1
          for (let e = el; e; e = e.parentElement) opacity *= +getComputedStyle(e).opacity
          if (opacity === 0) continue
          if (opacity < 1) fg = over([...fg.slice(0, 3), opacity], bg)
          const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
          const ratio = (hi + 0.05) / (lo + 0.05)
          const size = parseFloat(cs.fontSize)
          const large = size >= 24 || (+cs.fontWeight >= 700 && size >= 18.66)
          out.push({ ratio, floor: large ? 3 : 4.5, text: el.textContent.trim().slice(0, 40) })
        }
        return {
          text: out,
          scrollWidth: document.documentElement.scrollWidth,
          root: getComputedStyle(document.documentElement).fontSize,
        }
      })

      const where = `${mode.padEnd(5)} ${String(width).padStart(4)} ${path}`
      checked += r.text.length + 2
      const low = r.text.filter((t) => t.ratio < t.floor)
      for (const t of low.slice(0, 5))
        failures.push(`${where}  "${t.text}" reads ${t.ratio.toFixed(2)}:1, floor is ${t.floor}`)
      if (low.length > 5) failures.push(`${where}  … and ${low.length - 5} more under the floor`)
      if (r.scrollWidth > width) failures.push(`${where}  scrolls sideways: ${r.scrollWidth}px of content in ${width}px`)
      if (r.root !== readerRoot) failures.push(`${where}  root is ${r.root}, the reader's default is ${readerRoot}`)
      console.log(
        `${where.padEnd(60)} ${res.status()}  ${r.text.length} text, ${low.length} low` +
          `${r.scrollWidth > width ? ", OVERFLOWS" : ""}${r.root !== readerRoot ? ", ROOT" : ""}`
      )
    }
    await ctx.close()
  }
}
await browser.close()

console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures.slice(0, 40)) console.log(`  ${f}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every text clears its floor, nothing scrolls sideways, the root is the reader's\n")
