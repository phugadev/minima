/**
 * Emits app/syntax-light.json and app/syntax-dark.json — the same palette as
 * src/syntax.css, in the TextMate theme format Shiki takes.
 *
 * Two delivery paths exist because highlighters disagree about how to colour
 * things. Prism and highlight.js emit CLASSES, so syntax.css can bind them to
 * live custom properties and they follow the theme for free. Shiki emits
 * INLINE STYLES at build time, so it needs literal hex up front and cannot
 * follow anything — which is precisely why it has to be generated from the
 * same source rather than hand-picked to look close.
 *
 * The roles are read out of syntax.css, not restated here. A palette kept in
 * two places is a palette that disagrees with itself.
 *
 * One honest limitation: TextMate themes are hex, so this is a gamut-clamped
 * sRGB approximation. The CSS path carries the real OKLCH values and will be
 * slightly more saturated on a P3 display. That is a property of the format,
 * not a rounding bug — and it is the reason the CSS path is the primary one.
 *
 *   node scripts/build-syntax.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { srgb } from "./generate-scales.mjs"
import { readCss, syntaxThemeUrl } from "./sources.mjs"

const read = (f) => readCss(f.replace(/\.css$/, ""))
const FILES = ["ramps.css", "semantic.css", "depth.css", "syntax.css"]

const declarations = (css, selector) => {
  const start = css.indexOf(selector)
  if (start === -1) return {}
  const body = css.slice(start, css.indexOf("\n}", start))
  const out = {}
  for (const [, k, v] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[k] = v.trim()
  return out
}
const scope = (mode) => {
  const merged = {}
  for (const f of FILES) {
    Object.assign(merged, declarations(read(f), ":root {"))
    Object.assign(merged, declarations(read(f), ':root[data-theme="minima"] {'))
  }
  if (mode === "dark")
    for (const f of FILES) Object.assign(merged, declarations(read(f), ':root[data-theme="minima"].dark {'))
  return merged
}
const resolve = (vars, v, d = 0) => {
  if (d > 12) throw new Error(`var cycle at ${v}`)
  const m = v?.match(/^var\(--([\w-]+)(?:,[^)]*)?\)$/)
  return m ? resolve(vars, vars[m[1]], d + 1) : v
}
const hex = (css) => {
  if (!/^oklch\(/.test(css)) throw new Error(`not a literal colour: ${css}`)
  const [L, C, H] = css.slice(6, -1).split(/\s+/).map(Number)
  if ([L, C].some(Number.isNaN)) throw new Error(`unparseable: ${css}`)
  return (
    "#" +
    srgb(L, C, H || 0)
      .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
      .join("")
  )
}

/* TextMate scopes, grouped by the role each one belongs to. Deliberately
   coarse: a scope list that tries to name everything is a list nobody can
   check, and the whole argument for four colours is that the reader should be
   able to hold the mapping in their head. */
const SCOPES = {
  comment: ["comment", "punctuation.definition.comment", "string.comment"],
  punctuation: ["punctuation", "meta.brace", "keyword.operator", "meta.delimiter"],
  name: [
    "variable",
    "variable.other",
    "meta.object-literal.key",
    "support.variable",
    "meta.definition.variable.name",
  ],
  keyword: [
    "keyword",
    "keyword.control",
    "storage",
    "storage.type",
    "storage.modifier",
    "variable.language",
    "entity.name.type",
    "support.type",
    "support.class",
    "entity.name.class",
  ],
  function: [
    "entity.name.function",
    "support.function",
    "meta.function-call",
    "entity.name.tag",
    "entity.name.section",
  ],
  string: [
    "string",
    "string.quoted",
    "string.template",
    "constant.character",
    "string.regexp",
    "entity.other.attribute-name",
  ],
  number: ["constant.numeric", "constant.language", "constant.other", "constant.character.escape"],
}

const roles = [...read("syntax.css").matchAll(/--syntax-([\w-]+):\s*var\(--([\w-]+)\)/g)].map(
  ([, role]) => role
)
const missing = Object.keys(SCOPES).filter((r) => !roles.includes(r))
if (missing.length) throw new Error(`syntax.css has no --syntax-${missing.join(", --syntax-")}`)

for (const mode of ["light", "dark"]) {
  const vars = scope(mode)
  const colour = (role) => hex(resolve(vars, vars[`syntax-${role}`]))
  const groundToken = (read("prose.css").match(/\.prose pre \{[\s\S]*?background:\s*var\(--([\w-]+)\)/) ?? [])[1]

  const theme = {
    name: `minima-${mode}`,
    type: mode,
    colors: {
      "editor.background": hex(resolve(vars, vars[groundToken])),
      "editor.foreground": colour("name"),
    },
    tokenColors: Object.entries(SCOPES).map(([role, scopes]) => ({
      scope: scopes,
      settings: {
        foreground: colour(role),
        ...(role === "comment" ? { fontStyle: "italic" } : {}),
        /* Structure is ranked by tone and weight, not hue — see syntax.css.
           TextMate only has "bold" and "italic", so the CSS path's 600 becomes
           bold here; that is the format's granularity, not a different idea. */
        ...(role === "keyword" ? { fontStyle: "bold" } : {}),
      },
    })),
  }
  writeFileSync(syntaxThemeUrl(mode), JSON.stringify(theme, null, 2) + "\n")
  console.log(
    `wrote registry/syntax-${mode}.json — ${theme.tokenColors.length} roles, ` +
      `${theme.tokenColors.reduce((n, t) => n + t.scope.length, 0)} scopes, ground ${theme.colors["editor.background"]}`
  )
}
