/**
 * Registry audit.
 *
 * This is the layer that broke the previous attempt, and it broke silently:
 * `registryDependencies` were written as bare names — "button" — which is only
 * valid for shadcn's OWN items. For a GitHub registry a dependency is an
 * ADDRESS, `owner/repo/item`, and a bare name there resolves to shadcn/ui's
 * component instead of ours or fails the install outright. Nothing in the repo
 * could tell, because a registry is only exercised by installing it.
 *
 * So the rules the shadcn spec states are checked here rather than remembered:
 * enum membership for every type, a target on the file types that require one,
 * every path present and within the 5 MiB limit, no symlinks, unique names,
 * and every dependency written as something that can actually resolve.
 *
 *   node scripts/audit-registry.mjs
 */
import { readFileSync, statSync, lstatSync, existsSync } from "node:fs"
import { LAYOUT, registryJsonUrl } from "./sources.mjs"

const registryUrl = registryJsonUrl()
if (!registryUrl) {
  console.error(`no registry.json in the ${LAYOUT} layout — nothing to check, and a silent pass here would be a lie`)
  process.exit(1)
}
const registry = JSON.parse(readFileSync(registryUrl, "utf8"))

/* From https://ui.shadcn.com/schema/registry-item.json */
const ITEM_TYPES = [
  "registry:lib", "registry:block", "registry:component", "registry:ui",
  "registry:hook", "registry:theme", "registry:page", "registry:file",
  "registry:style", "registry:base", "registry:font", "registry:item",
]
const FILE_TYPES = ITEM_TYPES.filter((t) => t !== "registry:font")
/* "Target is required only for registry:page and registry:file types." */
const NEEDS_TARGET = ["registry:page", "registry:file"]
const MAX_BYTES = 5 * 1024 * 1024

const failures = []
const fail = (where, detail) => failures.push({ where, detail })
let checked = 0

for (const key of ["name", "homepage", "items"]) {
  checked++
  if (!registry[key]) fail("registry.json", `missing "${key}"`)
}
checked++
if (!Array.isArray(registry.items) || !registry.items.length)
  fail("registry.json", "no items — the check would pass by doing nothing")

const seen = new Set()
for (const item of registry.items ?? []) {
  const at = `item "${item.name ?? "(unnamed)"}"`

  checked += 3
  if (!item.name) fail(at, "missing name")
  if (!item.type) fail(at, "missing type")
  else if (!ITEM_TYPES.includes(item.type)) fail(at, `type "${item.type}" is not in the schema enum`)

  checked++
  if (seen.has(item.name)) fail(at, "duplicate name — installs would be ambiguous")
  seen.add(item.name)

  for (const file of item.files ?? []) {
    const where = `${at} file "${file.path}"`
    checked += 4

    if (!file.path) fail(where, "missing path")
    if (!file.type) fail(where, "missing type")
    else if (!FILE_TYPES.includes(file.type)) fail(where, `file type "${file.type}" is not in the schema enum`)

    if (NEEDS_TARGET.includes(file.type) && !file.target)
      fail(where, `type ${file.type} requires a target, or the CLI has nowhere to write it`)

    if (!file.path) continue
    const url = new URL(`../${file.path}`, import.meta.url)
    checked += 3
    if (!existsSync(url)) {
      fail(where, "does not exist")
      continue
    }
    if (lstatSync(url).isSymbolicLink()) fail(where, "is a symlink — the spec says to avoid them")
    const size = statSync(url).size
    if (size > MAX_BYTES) fail(where, `${(size / 1024 / 1024).toFixed(2)} MiB exceeds the 5 MiB limit`)
  }

  /* The one that sank the last attempt. A GitHub registry resolves a bare name
     against shadcn/ui, not against this repo — so anything of ours must be a
     full owner/repo/item address. */
  for (const dep of item.registryDependencies ?? []) {
    checked++
    const isUrl = /^https?:\/\//.test(dep)
    const isNamespaced = dep.startsWith("@")
    const segments = dep.split("#")[0].split("/")
    const isAddress = segments.length >= 3
    const isBareShadcn = segments.length === 1

    if (isUrl || isNamespaced || isAddress) continue
    if (isBareShadcn) {
      fail(
        at,
        `registryDependency "${dep}" is a bare name — that resolves to shadcn/ui's item, not this registry. Use "${registry.name && registry.homepage ? registry.homepage.split("/").slice(-2).join("/") : "owner/repo"}/${dep}".`
      )
    } else {
      fail(at, `registryDependency "${dep}" has ${segments.length} segment(s); an address needs at least 3`)
    }
  }
}

const owner = registry.homepage?.split("/").slice(-2).join("/")
console.log(`${registry.name} — ${registry.items?.length ?? 0} items, installed as ${owner}/<item>`)
for (const item of registry.items ?? []) {
  const deps = item.registryDependencies?.length ? ` -> ${item.registryDependencies.join(", ")}` : ""
  console.log(`  ${item.name.padEnd(14)} ${item.type.padEnd(14)}${deps}`)
}

console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.where}\n      ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every item resolves, every dependency is an address\n")
