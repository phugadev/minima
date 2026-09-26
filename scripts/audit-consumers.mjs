/**
 * Consumers — is Minima used, or only published?
 *
 * Every other runner checks the system against itself. This one checks it
 * against the projects that install it, because a registry item nobody uses
 * is a claim nobody has tested, and an installed copy that has fallen behind
 * the registry is a consumer quietly running a different system.
 *
 * For every consumer in consumers.json, on its default branch on GitHub:
 *
 *   current   each installed file is byte-identical to the registry's
 *   used      some OTHER file in the consumer imports it — installed but
 *             never imported is not use
 *
 * Then, across all consumers:
 *
 *   coverage  which registry items have at least one consumer using them,
 *             which modes and which kinds of project have been proven
 *
 * Drift or a claimed-but-unused item fails. An item with no consumer yet is
 * reported, not failed, before 1.0 — docs/1.0.md makes it a gate there.
 *
 *   npm run audit:consumers            (needs `gh` authenticated)
 */
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { posix } from "node:path"

const root = new URL("../", import.meta.url)
const registry = JSON.parse(readFileSync(new URL("registry.json", root), "utf8"))
const { consumers } = JSON.parse(readFileSync(new URL("consumers.json", root), "utf8"))

const gh = (path) => JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 64 << 20 }))
const blob = (repo, sha) => Buffer.from(gh(`repos/${repo}/git/blobs/${sha}`).content, "base64")

/* Every module a file imports, resolved to a repo path without extension:
   relative specifiers against the importing file, `@/` through the
   consumer's own tsconfig paths (`./*` for one app, `./src/*` for another).
   Bare package names are skipped. Resolving rather than string-matching is
   the point — a relative `./ui/layout` and an aliased `@/components/ui/layout`
   are the same import, and a comment naming the file is neither. */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|@import\s+(?:url\()?\s*)["']([^"']+)["']/g
const stripExt = (p) => p.replace(/\.(tsx?|jsx?|css|json|mjs)$/, "").replace(/\/index$/, "")
function resolver(aliasRoot) {
  return (file, spec) => {
    if (spec.startsWith("@/")) return stripExt(posix.normalize(posix.join(aliasRoot, spec.slice(2))))
    if (spec.startsWith(".")) return stripExt(posix.normalize(posix.join(posix.dirname(file), spec)))
    return null
  }
}
/* tsconfig is JSONC: comments and trailing commas. Strip them outside
   strings only — a glob pattern inside a string is not a comment. */
function parseJsonc(text) {
  let out = "", i = 0, inString = false
  while (i < text.length) {
    const c = text[i], n = text[i + 1]
    if (inString) {
      out += c
      if (c === "\\") out += text[++i]
      else if (c === '"') inString = false
      i++
    } else if (c === '"') { inString = true; out += c; i++ }
    else if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++ }
    else if (c === "/" && n === "*") { i = text.indexOf("*/", i + 2) + 2 }
    else { out += c; i++ }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
}
function aliasRootOf(repo, byPath) {
  const sha = byPath.get("tsconfig.json")
  if (!sha) return "."
  const target = parseJsonc(blob(repo, sha).toString("utf8")).compilerOptions?.paths?.["@/*"]?.[0] ?? "./*"
  return posix.normalize(target.replace(/\*$/, "")) || "."
}

const failures = []
const fail = (who, detail) => failures.push(`${who.padEnd(34)} ${detail}`)
const usedBy = {}
const modes = new Set()
const kinds = new Set()

for (const c of consumers) {
  const { default_branch: branch } = gh(`repos/${c.repo}`)
  const tree = gh(`repos/${c.repo}/git/trees/${branch}?recursive=1`).tree
  const byPath = new Map(tree.filter((t) => t.type === "blob").map((t) => [t.path, t.sha]))
  const sources = tree.filter(
    (t) => t.type === "blob" && /\.(tsx?|mdx?|css|mjs)$/.test(t.path) && !t.path.includes("node_modules")
  )
  const resolve = resolver(aliasRootOf(c.repo, byPath))
  const imported = new Map(
    sources.map((t) => {
      const body = blob(c.repo, t.sha).toString("utf8")
      const mods = new Set([...body.matchAll(IMPORT)].map((m) => resolve(t.path, m[1])).filter(Boolean))
      return [t.path, mods]
    })
  )

  console.log(`\n${c.name}  (${c.repo}@${branch}, ${c.kind}, ${c.modes.join(" + ")})`)
  for (const [name, paths] of Object.entries(c.items)) {
    const item = registry.items.find((i) => i.name === name)
    if (!item) {
      fail(`${c.name} ${name}`, "claimed, but the registry has no such item")
      continue
    }
    let current = true
    paths.forEach((path, i) => {
      const sha = byPath.get(path)
      const source = item.files[i]
      if (!sha) {
        current = false
        return fail(`${c.name} ${name}`, `${path} is not in the repo`)
      }
      const theirs = blob(c.repo, sha)
      const ours = readFileSync(new URL(source.path, root))
      if (!theirs.equals(ours)) {
        current = false
        fail(`${c.name} ${name}`, `${path} differs from ${source.path} — re-add it from the registry`)
      }
    })
    const targets = new Set(paths.map(stripExt))
    const importers = [...imported.entries()].filter(
      ([p, mods]) => !paths.includes(p) && [...mods].some((m) => targets.has(m))
    )
    if (importers.length === 0) fail(`${c.name} ${name}`, "installed, but nothing imports it")
    else (usedBy[name] ??= []).push(c.name)
    console.log(
      `  ${name.padEnd(14)} ${current ? "current" : "DRIFTED"}   ${
        importers.length ? `used by ${importers.length} file(s)` : "UNUSED"
      }`
    )
  }
  c.modes.forEach((m) => modes.add(m))
  kinds.add(c.kind)
}

console.log("\ncoverage")
const unproven = []
for (const item of registry.items) {
  const users = usedBy[item.name] ?? []
  if (!users.length) unproven.push(item.name)
  console.log(`  ${item.name.padEnd(14)} ${users.length ? users.join(", ") : "— no consumer yet"}`)
}
console.log(`  modes          ${["light", "dark"].map((m) => `${m} ${modes.has(m) ? "proven" : "unproven"}`).join(", ")}`)
console.log(`  kinds          ${[...kinds].join(", ")} (${kinds.size} of the 2 docs/1.0.md asks for)`)

console.log(`\n${consumers.length} consumer(s) — ${failures.length} failing, ${unproven.length} item(s) with no consumer yet`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every installed item is current and used\n")
