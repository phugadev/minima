/**
 * Install audit — the theme, measured in a real consumer app.
 *
 * Every other runner in this repo reads the CSS. That is the right way to check
 * a value, and it is structurally unable to check a BINDING: whether the
 * utility a component writes actually reaches the token the theme declares.
 * Three different bugs share one symptom there, and this repo has shipped all
 * three:
 *
 *   the token is not defined     — a var with no declaration. CSS drops the
 *                                  whole rule in silence. (--focus did this.)
 *   the utility was not emitted  — Tailwind only generates what it can see in
 *                                  scanned source. Six separate checks reported
 *                                  a defect that turned out to be this.
 *   the utility is mis-wired     — it generated, and points somewhere else.
 *
 * All three read as "the number is wrong" and none of them is visible from the
 * stylesheet. So this asserts all three per utility, and it does it against the
 * page scripts/build-coverage.mjs generates FROM the theme file — which is what
 * makes the second one impossible rather than merely remembered.
 *
 * The expected value is not computed here. It is read back off a probe element
 * with the raw token set inline, so the browser's own serialiser produces both
 * sides and no unit or colour-space maths sits between them.
 *
 *   APP=/path/to/an/install node scripts/build-coverage.mjs
 *   cd $APP && npm run build && npx next start -p 3210
 *   URL=http://localhost:3210 APP=/path/to/an/install node scripts/audit-install.mjs
 */
import { readFileSync } from "node:fs"
import { chromium } from "playwright"

const APP = process.env.APP
const URL = process.env.URL ?? "http://localhost:3210"
if (!APP) {
  console.error("APP=/path/to/an/install is required — it holds the generated manifest")
  process.exit(1)
}
const { probes, canary } = JSON.parse(readFileSync(`${APP}/minima-coverage.json`, "utf8"))

const failures = []
const fail = (mode, cls, detail) => failures.push({ mode, cls, detail })
let checked = 0

/** Measure one page's worth: token resolution, emission, and wiring. */
const measure = (page, all) =>
  page.evaluate((all) => {
    const root = document.documentElement
    const rootStyle = getComputedStyle(root)
    /* The probe lives outside the coverage tree so nothing on it inherits
       anything the utilities under test are setting. */
    const probe = document.createElement("i")
    probe.style.display = "inline-block"
    document.body.appendChild(probe)
    const bare = document.createElement("i")
    bare.style.display = "inline-block"
    document.body.appendChild(bare)
    const bareStyle = getComputedStyle(bare)

    const out = []
    for (const p of all) {
      const el = document.querySelector(`[data-c="${p.cls}"]`)
      const declared = rootStyle.getPropertyValue(p.token).trim()
      probe.style.cssText = "display:inline-block"
      /* setProperty with the var reference, so the browser resolves the token
         through its own cascade exactly as the utility does. */
      probe.style.setProperty(
        p.prop.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
        `var(${p.token})`
      )
      out.push({
        cls: p.cls,
        prop: p.prop,
        token: p.token,
        contested: p.contested,
        declared,
        present: !!el,
        actual: el ? getComputedStyle(el)[p.prop] : null,
        expected: getComputedStyle(probe)[p.prop],
        initial: bareStyle[p.prop],
      })
    }
    probe.remove()
    bare.remove()
    return out
  }, all)

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()

for (const mode of ["light", "dark"]) {
  await page.goto(`${URL}/minima-coverage`, { waitUntil: "networkidle" })
  await page.evaluate((m) => document.documentElement.classList.toggle("dark", m === "dark"), mode)
  /* Custom properties resolve lazily after a class change; reading in the same
     frame returns the previous mode's values. This cost a run of seven
     phantom failures once already. */
  await page.waitForTimeout(1200)

  const count = await page.getAttribute("[data-coverage]", "data-coverage")
  checked++
  if (Number(count) !== probes.length)
    fail(mode, "(page)", `page renders ${count} probes, the manifest has ${probes.length} — regenerate it`)

  const rows = await measure(page, [...probes, canary])
  const canaryRow = rows.pop()

  /* Canary first. Everything below reports "wired"; that only means something
     if a utility that does not exist still fails all three checks. */
  checked += 3
  if (canaryRow.declared !== "")
    fail(mode, "canary", "the canary token resolves — something is defining it, and the run below proves nothing")
  if (canaryRow.actual !== canaryRow.initial)
    fail(mode, "canary", `a class nobody defined changed ${canaryRow.prop} — the harness cannot see a miss`)

  const notDeclared = []
  const notEmitted = []
  const misWired = []
  const contested = []
  for (const r of rows) {
    checked += 3
    if (!r.present) {
      fail(mode, r.cls, "not rendered on the coverage page")
      continue
    }
    if (r.declared === "") notDeclared.push(r)
    else if (r.actual === r.initial && r.expected !== r.initial) notEmitted.push(r)
    else if (r.contested) contested.push(r)
    else if (!same(r)) misWired.push(r)
  }

  console.log(
    `${mode.padEnd(5)} ${rows.length} utilities — ${
      rows.length - notDeclared.length - notEmitted.length - misWired.length - contested.length
    } wired to a Minima token`
  )

  /* The contested seven. Minima does not own their value here, so comparing
     them to a rung would fail every correct install. What it DOES own is the
     anchor, and the anchor makes exactly two of them land on a rung — that is
     the claim install.md prints, and it is the one worth failing on. If shadcn
     changes its ratios, these two go first and the docs go stale in silence. */
  const anchored = { "rounded-sm": "--rung-mark", "rounded-lg": "--rung-control" }
  for (const [cls, rung] of Object.entries(anchored)) {
    checked++
    const r = rows.find((x) => x.cls === cls)
    if (!r) { fail(mode, cls, "missing from the manifest"); continue }
    const want = await page.evaluate((t) => {
      const i = document.createElement("i")
      i.style.display = "inline-block"
      i.style.borderTopLeftRadius = `var(${t})`
      document.body.appendChild(i)
      const v = getComputedStyle(i).borderTopLeftRadius
      i.remove()
      return v
    }, rung)
    if (r.actual !== want)
      fail(mode, cls, `is ${r.actual}, but the anchor should put it on ${rung} (${want}) — shadcn's ratios have moved, or --radius is no longer the control rung`)
  }
  if (contested.length)
    console.log(
      `  ${"shadcn owns radius".padEnd(22)} ${String(contested.length).padStart(3)}   ` +
        contested.map((r) => `${r.cls.slice(8)} ${r.actual}`).join("  ")
    )

  /* Prose must LOSE to a utility. */
  const overrides = await page.evaluate(() =>
    [...document.querySelectorAll("[data-o]")].map((el) => {
      const [prop, want] = el.getAttribute("data-o").split("|")
      const probe = document.createElement("i")
      probe.style.setProperty(prop, want.startsWith("--") ? `var(${want})` : want)
      document.body.appendChild(probe)
      const expected = getComputedStyle(probe).getPropertyValue(prop)
      probe.remove()
      return { tag: el.tagName, prop, want, expected, actual: getComputedStyle(el).getPropertyValue(prop) }
    })
  )
  checked += overrides.length
  const lost = overrides.filter((o) => o.actual !== o.expected)
  console.log(
    `  ${"prose vs utilities".padEnd(22)} ${String(overrides.length).padStart(3)}   ` +
      (lost.length ? `${lost.length} override(s) ignored` : "every override wins")
  )
  for (const o of lost)
    fail(mode, `prose ${o.tag.toLowerCase()}`, `${o.prop} is ${o.actual}, the utility asked for ${o.expected} — a .prose rule is outranking it`)

  /* Every focusable element, focused for real. audit-live tabs through a page
     and can only check what happens to be on it; this checks the LIST — and the
     list is where contenteditable went missing, falling through to a 1px auto
     ring at half alpha while every other control had 2px solid opaque. */
  const focusables = await page.evaluate(async () => {
    const out = []
    for (const el of document.querySelectorAll("[data-f]")) {
      el.focus()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const s = getComputedStyle(el)
      out.push({
        what: el.getAttribute("data-f"),
        owned: !el.hasAttribute("data-unowned"),
        focused: document.activeElement === el,
        width: s.outlineWidth,
        style: s.outlineStyle,
        colour: s.outlineColor,
        offset: s.outlineOffset,
      })
    }
    document.activeElement?.blur?.()
    const probe = document.createElement("i")
    probe.style.outlineColor = "var(--focus)"
    document.body.appendChild(probe)
    const focus = getComputedStyle(probe).outlineColor
    probe.remove()
    return { rows: out, focus }
  })
  const owned = focusables.rows.filter((r) => r.owned)
  const unowned = focusables.rows.filter((r) => !r.owned)
  checked += owned.length
  const ringless = owned.filter(
    (r) =>
      !r.focused ||
      r.style !== "solid" ||
      parseFloat(r.width) < 2 ||
      parseFloat(r.offset) < 1 ||
      r.colour !== focusables.focus
  )
  console.log(
    `  ${"focusable elements".padEnd(22)} ${String(owned.length).padStart(3)}   ` +
      (ringless.length ? `${ringless.length} without the ring` : "all carry the ring") +
      `; left to the browser: ${unowned.map((r) => r.what).join(", ")}`
  )
  for (const r of ringless)
    fail(
      mode,
      `focus ${r.what}`,
      r.focused
        ? `got ${r.width} ${r.style} ${r.colour} at ${r.offset}, expected 2px solid ${focusables.focus} at the offset — it is not in state.css's list`
        : "did not take focus, so nothing was proven about it"
    )

  /* And the variant bridge, which is shadcn's file rather than ours. */
  checked++
  const bridge = await page.evaluate(() =>
    getComputedStyle(document.querySelector("[data-variant-bridge]")).flexDirection
  )
  console.log(`  ${"shadcn variant bridge".padEnd(22)}       data-horizontal -> flex-direction ${bridge}`)
  if (bridge !== "column")
    fail(
      mode,
      "variant bridge",
      'data-horizontal: does not resolve to [data-orientation="horizontal"] — this project is missing `@import "shadcn/tailwind.css"`, and the tabs list will lay out sideways with no underline on the line variant'
    )

  const line = (label, list) =>
    `  ${label.padEnd(22)} ${String(list.length).padStart(3)}${list.length ? "   " + list.slice(0, 3).map((r) => r.cls).join(", ") : ""}`
  if (notDeclared.length) console.log(line("token undefined", notDeclared))
  if (notEmitted.length) console.log(line("utility not emitted", notEmitted))
  if (misWired.length) console.log(line("points elsewhere", misWired))

  for (const r of notDeclared) fail(mode, r.cls, `${r.token} resolves to nothing at :root`)
  for (const r of notEmitted)
    fail(mode, r.cls, `${r.prop} is still the initial value (${r.initial}) — the utility was never generated`)
  for (const r of misWired)
    fail(mode, r.cls, `${r.prop} is ${r.actual}, but ${r.token} is ${r.expected}`)
}

/** Shadows compose through --tw-shadow, so the token is a substring, not the
    whole value. Everything else is compared exactly. */
function same(r) {
  if (r.prop === "boxShadow") return r.actual.includes(r.expected) || r.expected === "none"
  return r.actual === r.expected
}

await browser.close()
console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures.slice(0, 40)) console.log(`  [${f.mode}] ${f.cls.padEnd(28)} ${f.detail}`)
  if (failures.length > 40) console.log(`  ... and ${failures.length - 40} more`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every token resolves, every utility is emitted, every binding points at its token\n")
