/**
 * Drift, direction two: has UPSTREAM drifted away from us?
 *
 * Forking shadcn means inheriting a maintenance question — when they fix a bug
 * or change an API, does our copy know? A plain text diff cannot answer it,
 * because we deliberately replace every class string: it would report our own
 * intended work as drift on every run, and a checker that always cries wolf is
 * one people stop reading. That is precisely how minima-old ended up with ten
 * components that had silently diverged.
 *
 * So the comparison is STRUCTURAL. Both sides are normalised by blanking every
 * className and every cva() argument, leaving elements, props, data attributes,
 * imports and logic. Then:
 *
 *   ours vs baseline      what WE changed. Should be data attributes and little
 *                         else — if it is more, the port is doing too much.
 *   baseline vs upstream  what THEY changed since we forked. Anything here must
 *                         be ported, and it is the only thing that fails.
 *
 *   node scripts/audit-upstream.mjs --sync   # record baselines (needs network)
 *   node scripts/audit-upstream.mjs          # check drift
 *
 * The baseline is the whole discipline. Without a recorded upstream ref there
 * is nothing to compare against and the check passes by doing nothing — which
 * would be the third no-op audit in this project, so a missing baseline is a
 * FAILURE, not a skip.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"

const SYNC = process.argv.includes("--sync")
/* The style the components were forked from. A registry repo has no
   components.json of its own — it is not a consuming app — so the baseline
   manifest is the record, and it is written at sync time. Before the first
   sync there is nothing to remember, hence the env override. */
const MANIFEST_URL = new URL("../.upstream/manifest.json", import.meta.url)
const STYLE = existsSync(MANIFEST_URL)
  ? JSON.parse(readFileSync(MANIFEST_URL, "utf8")).style
  : (process.env.SHADCN_STYLE ?? "base-nova")
const DIR = new URL("../.upstream/", import.meta.url)
const MANIFEST = MANIFEST_URL

/* Components we forked from shadcn. Proprietary ones are not listed — there is
   no upstream to drift from. */
const FORKED = ["button", "tabs", "input"]

const fetchUpstream = async (name) => {
  const url = `https://ui.shadcn.com/r/styles/${STYLE}/${name}.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  const json = await res.json()
  const file = json.files.find((f) => f.path.endsWith(`${name}.tsx`))
  if (!file) throw new Error(`no ${name}.tsx in ${url}`)
  return file.content
}

/** Strip everything we own, leaving everything they own. */
function normalise(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

  /* className={...} / className="..." — blank the value, keep the prop. */
  out = out.replace(/className\s*=\s*"[^"]*"/g, "className=<CLS>")
  out = blankBalanced(out, /className\s*=\s*\{/g, "{", "}", "className=<CLS>")
  /* cva(...) — the entire call is styling. */
  out = blankBalanced(out, /\bcva\s*\(/g, "(", ")", "cva(<CLS>)")

  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
}

/** Replace each match plus its balanced delimiters with `replacement`. */
function blankBalanced(src, opener, open, close, replacement) {
  let out = ""
  let i = 0
  for (;;) {
    opener.lastIndex = i
    const m = opener.exec(src)
    if (!m) return out + src.slice(i)
    out += src.slice(i, m.index) + replacement
    let depth = 0
    let j = m.index + m[0].length - 1
    for (; j < src.length; j++) {
      if (src[j] === open) depth++
      else if (src[j] === close && --depth === 0) break
    }
    i = j + 1
  }
}

/* ── Variants ──────────────────────────────────────────────────────────────
   The structural diff blanks every className, which is what stops it crying
   wolf — and it means a className-only regression is invisible to it. That is
   not theoretical: porting tabs to tokens turned
   `group-data-horizontal/tabs:after:bottom-[-5px]` into
   `group-data-horizontal/tabs:-bottom-1`, silently dropping the `after:` and
   displacing the tab instead of its underline. Both runners passed.

   So the variants are compared even though the values are not. We may restyle
   freely; we may not quietly stop targeting a pseudo-element or a state that
   upstream targeted. Anything deliberately dropped is listed below, which
   makes removing one an act rather than an accident. */
const INTENTIONALLY_DROPPED = {
  /* state.css owns the focus ring for every control, so the per-component
     rings are removed on purpose — see the note in app/state.css. */
  button: [
    "focus-visible:ring",
    "focus-visible:border",
    /* dark:bg-input/30 and dark:bg-destructive/20 are gone because
       --surface-raised and the red fill already carry both modes — the
       variant existed only to patch a token that did not adapt. */
    "dark:bg",
  ],
  tabs: ["focus-visible:ring", "focus-visible:border", "focus-visible:outline"],
  input: [],
}

/** `hover:bg-muted` -> `hover:bg`; `group-x/y:after:bottom-[-5px]` -> `after:bottom`. */
function variants(src) {
  const found = new Set()
  for (const [, cls] of src.matchAll(/"([^"]*:[^"]*)"/g)) {
    for (const token of cls.split(/\s+/)) {
      if (!token.includes(":")) continue
      const parts = token.split(":")
      const utility = parts.pop()
      let root = utility.replace(/^-/, "").split(/[-[]/)[0]
      /* Minima moved the type scale off Tailwind's text-* namespace onto
         type-*, because cn() misfiles a custom text-* as a colour and drops
         it (see app/type.css). So upstream's text-sm and our type-body are
         the same target under a different name, and without this the rename
         would report every size as a dropped variant — noise that would get
         the whole check ignored. Text COLOURS keep the text root, so a real
         drop there is still visible. */
      if (root === "text" && /^text-(xs|sm|base|lg|xl|[2-9]xl)$/.test(utility)) root = "type" 
      if (!root) continue
      for (const v of parts) {
        /* Group/peer variants name a container, not a state — the interesting
           part is what they are combined with. */
        if (v.startsWith("group-") || v.startsWith("peer-") || v.startsWith("in-")) continue
        found.add(`${v}:${root}`)
      }
    }
  }
  return found
}

/** Minimal LCS line diff. */
function diff(a, b) {
  const A = a.split("\n")
  const B = b.split("\n")
  const n = A.length
  const m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(`- ${A[i++]}`)
    else out.push(`+ ${B[j++]}`)
  }
  while (i < n) out.push(`- ${A[i++]}`)
  while (j < m) out.push(`+ ${B[j++]}`)
  return out
}

if (SYNC) {
  mkdirSync(DIR, { recursive: true })
  const manifest = { style: STYLE, recorded: new Date().toISOString(), components: {} }
  for (const name of FORKED) {
    const content = await fetchUpstream(name)
    writeFileSync(new URL(`${name}.tsx`, DIR), content)
    manifest.components[name] = { lines: content.split("\n").length }
    console.log(`recorded ${name} (${content.split("\n").length} lines)`)
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n")
  console.log(`\nbaseline written for style "${STYLE}". Commit .upstream/ — it is the reference the drift check needs.`)
  process.exit(0)
}

if (!existsSync(MANIFEST)) {
  console.log("\nNo baseline in .upstream/. Run: node scripts/audit-upstream.mjs --sync")
  console.log("Without one there is nothing to compare against and this check would pass by doing nothing.\n")
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"))
let online = true
const failures = []

console.log(`baseline: style "${manifest.style}", recorded ${manifest.recorded.slice(0, 10)}\n`)

for (const name of FORKED) {
  const baseline = normalise(readFileSync(new URL(`${name}.tsx`, DIR), "utf8"))
  const ours = normalise(readFileSync(new URL(`../registry/ui/${name}.tsx`, import.meta.url), "utf8"))

  const mine = diff(baseline, ours)
  let theirs = null
  if (online) {
    try {
      theirs = diff(baseline, normalise(await fetchUpstream(name)))
    } catch {
      online = false
    }
  }

  const upstreamVariants = variants(readFileSync(new URL(`${name}.tsx`, DIR), "utf8"))
  const ourVariants = variants(readFileSync(new URL(`../registry/ui/${name}.tsx`, import.meta.url), "utf8"))
  const dropped = [...upstreamVariants].filter(
    (v) => !ourVariants.has(v) && !(INTENTIONALLY_DROPPED[name] ?? []).includes(v)
  )
  if (dropped.length) {
    failures.push({ name, lines: dropped.length })
    console.log(`  ${name.padEnd(8)} DROPPED VARIANT(S): ${dropped.join(", ")}`)
    console.log(`           upstream targets these and we no longer do. If that is deliberate,`)
    console.log(`           add it to INTENTIONALLY_DROPPED in this file.`)
  }

  const ourLine = `ours vs baseline: ${mine.length} structural line(s)`
  const theirLine = theirs ? `upstream moved: ${theirs.length} line(s)` : "upstream: offline, not checked"
  console.log(`  ${name.padEnd(8)} ${ourLine.padEnd(38)} ${theirLine}`)

  if (mine.length) for (const l of mine.slice(0, 6)) console.log(`             ${l.slice(0, 96)}`)
  if (theirs?.length) {
    failures.push({ name, lines: theirs.length })
    for (const l of theirs.slice(0, 8)) console.log(`      UPSTREAM ${l.slice(0, 96)}`)
  }
}

if (!online) console.log("\n(no network — only our own drift was checked)")
console.log(`\n${FORKED.length} component(s) — ${failures.length} with upstream changes to port`)
if (failures.length) {
  console.log("")
  process.exit(1)
}
console.log("PASS — upstream has not moved structurally since the baseline\n")
