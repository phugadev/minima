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
 * Registry only: it reads this repository's own history.
 *
 *   node scripts/audit-changelog.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"

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
console.log("PASS — every change that ships came with a changelog entry\n")
