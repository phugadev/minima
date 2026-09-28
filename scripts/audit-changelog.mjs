/**
 * Changelog — did every change that ships say so?
 *
 * docs/1.0.md promises the changelog records every change since the
 * foundation. A promise about a document is only kept if something checks it,
 * so: from the commit that introduced CHANGELOG.md onward, every commit on
 * this branch that touches what a consumer receives — the theme sources, the
 * registry, the runners that vouch for them — must also touch CHANGELOG.md.
 *
 * It cannot judge whether the entry is any good. It can make forgetting one
 * impossible to merge unnoticed, which is the failure that actually happens.
 *
 * And one more thing, because of how Minima reaches people: the registry
 * serves the default branch, so whatever is on `main` is what every consumer
 * installs. The version promise in docs/1.0.md only holds if `main` is always
 * a release. So on `main` — or anywhere with --release — the changelog's
 * [Unreleased] section must be empty and package.json must carry the newest
 * released version. Work in progress lives on branches, where this half is
 * reported, not failed.
 *
 * Registry only: it reads this repository's own history.
 *
 *   node scripts/audit-changelog.mjs             (release check on main only)
 *   node scripts/audit-changelog.mjs --release   (release check here too)
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

const root = new URL("../", import.meta.url)
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()

if (!existsSync(new URL("CHANGELOG.md", root)) || !existsSync(new URL("registry.json", root))) {
  console.log("audit-changelog runs in the registry repo only — nothing to check here\n")
  process.exit(0)
}

/* What ships, or vouches for what ships. Docs and README are not here on
   purpose: a wording fix is not a change a consumer receives. */
const SHIPS = /^(src\/|registry\/|registry\.json$|scripts\/)/

const introduced = git("log", "--diff-filter=A", "--format=%H", "--", "CHANGELOG.md").split("\n").pop()
const commits = introduced ? git("rev-list", "--reverse", `${introduced}..HEAD`).split("\n").filter(Boolean) : []

const failures = []
for (const sha of commits) {
  const files = git("show", "--name-only", "--format=", sha).split("\n").filter(Boolean)
  const ships = files.filter((f) => SHIPS.test(f))
  if (ships.length && !files.includes("CHANGELOG.md")) {
    failures.push(`${sha.slice(0, 7)} ${git("show", "-s", "--format=%s", sha)}\n      changes ${ships.slice(0, 3).join(", ")}${ships.length > 3 ? " …" : ""} and not CHANGELOG.md`)
  }
}

/* ── main is a release ─────────────────────────────────────────────────── */
const branch = git("rev-parse", "--abbrev-ref", "HEAD")
const enforce = branch === "main" || process.argv.includes("--release")
const changelog = readFileSync(new URL("CHANGELOG.md", root), "utf8")
const unreleased = (changelog.split(/^## \[Unreleased\]\s*$/m)[1] ?? "").split(/^## \[/m)[0].trim()
const newest = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1]
const version = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).version
const release = []
if (unreleased) release.push("[Unreleased] has entries — on main every change is released; move them under a version")
if (newest !== version) release.push(`package.json is ${version}, the newest release in CHANGELOG.md is ${newest}`)
if (enforce) {
  for (const r of release) failures.push(`release  ${r}`)
} else if (release.length) {
  console.log(`on ${branch}, not yet a release (checked on main, or with --release):`)
  for (const r of release) console.log(`  - ${r}`)
  console.log("")
}

console.log(
  introduced
    ? `${commits.length} commit(s) since CHANGELOG.md began (${introduced.slice(0, 7)})`
    : "CHANGELOG.md is not committed yet — nothing to check"
)
console.log(`\n${commits.length} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f}`)
  console.log("")
  process.exit(1)
}
console.log(`PASS — every change that ships came with a changelog entry${enforce ? `, and ${branch === "main" ? "main" : "this branch"} is release ${version}` : ""}\n`)
