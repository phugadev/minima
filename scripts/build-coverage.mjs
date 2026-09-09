/**
 * Emits a coverage page for a REAL install — every utility Minima claims to
 * provide, rendered once so the JIT has to generate it.
 *
 * This exists because of one bug that came back six times. Tailwind only emits
 * a utility it can SEE used in scanned source, so a probe typed into a console
 * measures 0px and looks exactly like a broken token. Six separate times a
 * check reported a defect that did not exist — `shadow-xl`, `font-sans`,
 * `shadow-sm`, `rounded-sm`, `duration-slow-exit`, `normal-case` — and each one
 * cost a detour before the cause was recognised again.
 *
 * The fix is not to remember. It is to stop measuring utilities that were never
 * asked for: the page below is GENERATED from registry/minima.css, so every
 * token in the theme appears in scanned source by construction and a missing
 * utility can only mean the theme is broken.
 *
 * It also carries the assertion, as a manifest of (class, property, token)
 * triples. audit-install.mjs reads it and checks three things at once for each:
 * the token resolves, the utility generated, and the utility points at that
 * token. A JIT miss, a dangling var and a mis-wired binding are three different
 * bugs with one identical symptom, and this separates them.
 *
 *   APP=/path/to/an/install node scripts/build-coverage.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"

const APP = process.env.APP
if (!APP) {
  console.error("APP=/path/to/an/install is required — this writes a page into a consumer app")
  process.exit(1)
}

const css = readFileSync(new URL("../registry/minima.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
)

/* Every @theme declaration, in source order. */
const themeBody = [...css.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n")
const themeDecls = [...themeBody.matchAll(/^\s*(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/gm)].map((m) => [
  m[1],
  m[2].trim(),
])

/* A @theme value is nearly always `var(--token)`. Keep the indirection when it
   is there — that is the binding under test — and fall back to the literal. */
const source = (value, key) => {
  const m = value.match(/^var\(\s*(--[a-zA-Z0-9_-]+)\s*\)$/)
  return m ? m[1] : key
}

/* The seven radius keys `shadcn init` re-derives from --radius in its own
   @theme. Its block always comes after ours — CSS puts every @import at the
   top of the file — so in a shadcn project these are shadcn's numbers, not
   Minima's. They are still measured, against the contract in install.md
   rather than against the token, because the anchor is what makes two of them
   land on a rung and that is a claim worth failing on. */
const CONTESTED = new Set(
  ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"].map((k) => `rounded-${k}`)
)

const probes = []
const add = (cls, prop, token, note) =>
  probes.push({ cls, prop, token, note, contested: CONTESTED.has(cls) || undefined })

for (const [key, value] of themeDecls) {
  const tok = source(value, key)
  if (key.startsWith("--color-")) add(`bg-${key.slice(8)}`, "backgroundColor", tok)
  else if (key.startsWith("--radius-")) add(`rounded-${key.slice(9)}`, "borderTopLeftRadius", tok)
  else if (key.startsWith("--shadow-")) add(`shadow-${key.slice(9)}`, "boxShadow", tok)
  else if (key.startsWith("--ease-")) add(`ease-${key.slice(7)}`, "transitionTimingFunction", tok)
  else if (key.startsWith("--spacing-")) {
    const n = key.slice(10)
    add(`p-${n}`, "paddingTop", tok)
    /* The control rungs exist to be a HEIGHT. Checking them only as padding
       would leave the utility a component actually writes untested. */
    if (n.startsWith("control-")) add(`h-${n}`, "height", tok)
  }
}

/* @utility blocks declare their own source token in the body — read it rather
   than guessing the name, or a rename silently stops being checked. */
for (const m of css.matchAll(/@utility ([\w-]+) \{([\s\S]*?)\n\}/g)) {
  const [, name, body] = m
  const first = body.match(/^\s*([a-z-]+):\s*var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/m)
  if (!first) continue
  const camel = first[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  add(name, camel, first[2])
}

/* The two register classes. They are @layer components rather than utilities,
   and they are the reason the system ships a mono face at all — an unresolved
   --font-mono turns the figure register back into the reading one, silently. */
add("signal", "fontFamily", "--font-mono", "register")
add("figure", "fontFamily", "--font-mono", "register")

/* Canary. Everything above reports "resolves"; that is only worth reading if
   the harness can still SEE a utility that does not. This one must FAIL the
   same three checks, or the run underneath it means nothing. */
const canary = { cls: "bg-minima-canary-notreal", prop: "backgroundColor", token: "--minima-canary-notreal", note: "canary" }

const manifest = { probes, canary }
mkdirSync(`${APP}/app/minima-coverage`, { recursive: true })
writeFileSync(`${APP}/minima-coverage.json`, JSON.stringify(manifest, null, 1))

/* Literal class strings, one element each. Tailwind scans source text, so a
   className built at runtime would generate nothing and every probe would
   report the bug this file exists to rule out. */
const cell = (p) => `      <i data-c="${p.cls}" className="${p.cls}">.</i>`

/* One unlayered rule, and only display. An inline box computes height to auto,
   so every control rung would report a false miss; anything MORE than display
   here would outrank the very utilities under test. */
const style = '<style>{"[data-c]{display:inline-block}"}</style>'

/* Two fixtures that are not about a token at all.

   PROSE has to lose to a utility. It is a set of defaults for elements nobody
   put a class on, and an unlayered rule would outrank every Tailwind utility
   there is — which it did, silently, for four out of four overrides.

   The ORIENTATION VARIANT is not Minima's. `data-horizontal:` resolves to
   [data-orientation="horizontal"] only when `shadcn/tailwind.css` is imported;
   Tailwind's own built-in reads it as [data-horizontal], which Base UI never
   sets. Without that import the tabs list lays out sideways and the line
   variant's underline collapses to 0px. Neither is visible from our source. */
const fixtures = [
  '      <article className="prose">',
  /* the TEXT rung, not the solid — a fixture should not model a pairing
     colour-roles rule 4 tells you not to write */
  '        <h2 className="text-blue-text" data-o="color|--blue-text">x</h2>',
  '        <p className="mt-0" data-o="margin-top|0px">',
  '          <a href="#" className="text-green-text" data-o="color|--green-text">x</a>{" "}',
  '          <code className="bg-transparent" data-o="background-color|transparent">x</code>',
  '        </p>',
  '      </article>',
  '      <div data-orientation="horizontal" data-variant-bridge className="data-horizontal:flex-col">x</div>',
]

const page = [
  "/* GENERATED by scripts/build-coverage.mjs — do not edit.",
  "   Every utility the Minima theme claims to provide, used once so Tailwind",
  "   has to emit it. scripts/audit-install.mjs measures this page. */",
  "export default function MinimaCoverage() {",
  "  return (",
  `    <div data-coverage="${probes.length}">`,
  `      ${style}`,
  ...fixtures,
  ...probes.map(cell),
  `      <i data-c="${canary.cls}" className="${canary.cls}">.</i>`,
  "    </div>",
  "  )",
  "}",
  "",
].join("\n")

writeFileSync(`${APP}/app/minima-coverage/page.tsx`, page)

console.log(
  `wrote ${APP}/app/minima-coverage/page.tsx — ${probes.length} utilities ` +
    `(${probes.filter((p) => p.prop === "backgroundColor").length} colour, ` +
    `${probes.filter((p) => p.prop !== "backgroundColor").length} other) + 1 canary`
)
