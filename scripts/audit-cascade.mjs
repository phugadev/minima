/**
 * Cascade audit — two rules about the SHIPPED file that no value check can see.
 *
 * Both come from bugs that were live in the repo and invisible to every runner
 * in it, because every other runner asks "is this value right" and neither of
 * these is about a value.
 *
 *   A DANGLING var() TAKES THE WHOLE DECLARATION WITH IT. An undefined custom
 *   property does not fall back to anything — the declaration becomes invalid
 *   at computed-value time and CSS drops it in silence. `--focus` did this: it
 *   pointed at a ramp token that only existed under the theme scope, so in a
 *   stock project the focus ring had no outline at all and measured perfectly
 *   compliant in every token-level check. So: every reference either resolves
 *   in this file or carries a fallback. No allowlist — an allowlist is where
 *   the next one would hide.
 *
 *   AN UNLAYERED RULE BEATS EVERY UTILITY. Tailwind puts its utilities in
 *   `@layer utilities`, and unlayered CSS outranks every layer there is. The
 *   whole prose layer was unlayered, so inside `.prose` a consumer's
 *   `text-green-text`, `bg-transparent` and `mt-0` were all silently ignored —
 *   className present in the DOM, cascade picking something else. Token blocks
 *   are the exception and stay unlayered on purpose: a custom property declares
 *   a value, it never competes with a utility for a property.
 *
 *   node scripts/audit-cascade.mjs
 */
import { readFileSync } from "node:fs"

const RAW = readFileSync(new URL("../registry/minima.css", import.meta.url), "utf8")

const failures = []
const fail = (rule, detail) => failures.push({ rule, detail })
let checked = 0

/** Declarations, references, and top-level rules — comments stripped first. */
const analyse = (raw) => {
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, "")
  const defined = new Set(
    [...css.matchAll(/(?:^|[;{])\s*(--[a-zA-Z0-9_-]+)\s*:/gm)].map((m) => m[1])
  )
  const refs = []
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(,)?/g))
    refs.push({ name: m[1], fallback: !!m[2] })

  /* A character scanner rather than a line one. A line-based walk cannot tell
     a top-level rule from a nested one, and a nested `:` inside a value reads
     as a declaration — which is how the first version of this reported twelve
     :root blocks as styling the page. */
  const top = []
  let depth = 0
  let head = ""
  let body = ""
  for (const ch of css) {
    if (ch === "{") {
      depth++
      if (depth === 1) {
        body = ""
        continue
      }
    } else if (ch === "}") {
      depth--
      if (depth === 0) {
        top.push({ selector: head.trim(), body })
        head = ""
        continue
      }
    }
    if (depth === 0) head += ch
    else body += ch
  }
  return { defined, refs, top }
}

const { defined, refs, top } = analyse(RAW)

/* ── 1. Every var() resolves, or says what to do when it does not ────────── */
const dangling = refs.filter((r) => !defined.has(r.name) && !r.fallback)
checked += refs.length
console.log(
  `references  ${refs.length} var() uses, ${defined.size} declarations — ` +
    `${dangling.length ? `${dangling.length} dangling` : "none dangling"}`
)
for (const d of [...new Set(dangling.map((d) => d.name))])
  fail("dangling var", `${d} is referenced with no declaration and no fallback — the declaration using it is dropped silently`)

/* ── 2. Nothing outside a layer may style anything ───────────────────────── */
/* A token block is allowed out here. A custom property declares a value; it
   never competes with a utility for a property, so its specificity against one
   is not a question that arises. `color-scheme` is the one real property that
   belongs at :root — it is a document-level statement about the canvas, and it
   has no utility to lose to. */
const PROPERTY = /^(--[a-zA-Z0-9_-]+|color-scheme)$/
const styling = []
for (const rule of top) {
  if (rule.selector.startsWith("@")) continue
  checked++
  const offenders = rule.body
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.includes(":"))
    .map((d) => d.slice(0, d.indexOf(":")).trim())
    .filter((name) => name && !PROPERTY.test(name))
  if (offenders.length) styling.push({ selector: rule.selector, offenders })
}
const bare = top.filter((r) => !r.selector.startsWith("@"))
console.log(
  `layering    ${bare.length} unlayered rules — ` +
    `${styling.length ? `${styling.length} style real properties` : "all of them declare tokens only"}`
)
for (const s of styling)
  fail(
    "unlayered styling",
    `${s.selector} sets ${s.offenders.length} real propert${s.offenders.length === 1 ? "y" : "ies"} (${[...new Set(s.offenders)].slice(0, 3).join(", ")}) outside any @layer, so it outranks every Tailwind utility`
  )

/* ── Canaries ────────────────────────────────────────────────────────────── */
/* Both rules above just reported clean. That is only worth reading if the
   analysis can still SEE each bug, so each one is fed the shape it exists for
   and has to find it. A silent canary means the green above means nothing. */
checked += 2
const canaryVar = analyse(":root { --a: var(--nowhere); }")
if (canaryVar.refs.filter((r) => !canaryVar.defined.has(r.name) && !r.fallback).length !== 1)
  fail("canary", "a var() with no declaration was not detected — rule 1 has stopped working")

const canaryLayer = analyse(".x {\n  color: red;\n}\n")
const seen = canaryLayer.top.filter(
  (r) => !r.selector.startsWith("@") && /(^|\s)color\s*:/.test(r.body)
)
if (seen.length !== 1)
  fail("canary", "an unlayered styling rule was not detected — rule 2 has stopped working")

console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.rule.padEnd(18)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every reference resolves, and nothing outside a layer outranks a utility\n")
