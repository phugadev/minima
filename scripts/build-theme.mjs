/**
 * Emits registry/minima.css — the whole theme as one file.
 *
 * One file and one import line is the entire adoption cost of Minima, so the
 * sources being nine files is a fact about authoring, not about shipping. This
 * concatenates them in dependency order and does one transformation that
 * matters:
 *
 *   THE A/B SCOPE IS REMOVED. The sources are written under
 *   :root[data-theme="minima"] so the lab can hold Minima and stock shadcn on
 *   the same page and switch between them. A consumer has no A/B to run — they
 *   installed one theme — so the selector becomes plain :root and .dark, which
 *   is what makes it apply to shadcn's components without a wrapper attribute.
 *
 * Order is dependency order, not alphabetical: ramps define the values, the
 * semantic layer names them, the Tailwind bindings expose them, and everything
 * after that consumes them.
 *
 *   node scripts/build-theme.mjs
 */
import { writeFileSync } from "node:fs"
import { readCss, ORDER, LAYOUT } from "./sources.mjs"

/* ORDER lives in sources.mjs because the lab imports the same files in the same
   sequence, and a second copy of it here is a second thing to keep right. */
if (LAYOUT !== "registry") {
  console.error("build-theme only runs where there is a registry/ to write into")
  process.exit(1)
}

const src = (name) => readCss(name)

/* The semantic layer redefines shadcn's own eighteen names, so it has to beat
   shadcn's :root — and it cannot do that on source order, because CSS requires
   @import at the TOP of a file while `shadcn init` writes its :root block
   below. A plain :root would tie on specificity, lose to source order, and the
   install would silently do nothing.
   
   :root:root is the same element at one more point of specificity. Measured:
   plain :root loses to a later :root, the doubled form wins regardless of
   order, and a consumer can still override it from their own file.
   
   Only this one file needs it. Every other source defines names nobody else
   uses, so they stay at plain :root and can be overridden normally. */
const OUTRANKS_SHADCN = new Set(["semantic"])

/* Longest selector first, or the bare one would match inside the .dark one and
   leave a stray `.dark` fragment behind. */
const unscope = (css, name) => {
  const root = OUTRANKS_SHADCN.has(name) ? ":root:root" : ":root"
  const dark = OUTRANKS_SHADCN.has(name) ? ":root:root.dark" : ".dark"
  return css
    .replaceAll(':root[data-theme="minima"].dark', dark)
    .replaceAll(':root[data-theme="minima"]', root)
}

const parts = ORDER.map((name) => {
  const body = unscope(src(name), name).trim()
  return `/* ═══ ${name} ${"═".repeat(Math.max(0, 66 - name.length))} */\n\n${body}`
})

const header = `/* ═══════════════════════════════════════════════════════════════════════════
   MINIMA — a Tailwind v4 theme
   GENERATED FILE. Do not edit: it is rebuilt from src/*.css by
   scripts/build-theme.mjs, and every value in it is checked by the runners in
   scripts/ before it ships.

   Install:   npx shadcn@latest add phugadev/minima/theme
   Then add one line to your global stylesheet, after the Tailwind import:

       @import "tailwindcss";
       @import "../styles/minima.css";

   That is the whole adoption cost. Existing shadcn components pick it up
   without being edited, because Minima re-points Tailwind's own radius,
   shadow, easing and colour scales rather than inventing parallel names.

   Components are optional and separate:
       npx shadcn@latest add phugadev/minima/button
   ═══════════════════════════════════════════════════════════════════════════ */

`

const css = header + parts.join("\n\n")
writeFileSync(new URL("../registry/minima.css", import.meta.url), css)

const stray = css.match(/data-theme="minima"/g)
if (stray) throw new Error(`${stray.length} A/B selector(s) survived unscoping — the theme would not apply`)
/* Without this the semantic layer ties with shadcn's block and loses on source
   order, which looks exactly like the install not having happened. */
if (!css.includes(":root:root {") || !css.includes(":root:root.dark {"))
  throw new Error("the semantic layer is not outranking shadcn's :root — a consumer install would be a no-op")

console.log(
  `wrote registry/minima.css — ${ORDER.length} sources, ${css.split("\n").length} lines, ` +
    `${(Buffer.byteLength(css) / 1024).toFixed(0)} KiB`
)
