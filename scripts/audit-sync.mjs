/**
 * Sync audit — is the lab still a copy, or has it quietly become a fork?
 *
 * The lab holds the same CSS, the same components, the same `cn` and now the
 * same runners as this repo. Every one of those is a copy, and copies drift in
 * the direction nobody is looking.
 *
 * They already did, expensively. `outline-ring/50` was deleted from the lab's
 * globals.css to fix a focus-ring bug — a real fix, in the wrong tree. Every
 * consumer's `shadcn init` writes that line straight back, so the ring stayed
 * broken everywhere except on the one page the runner was pointed at, and the
 * check that would have caught it was looking at the exception.
 *
 * Eleven runners had also fallen behind, one of them still reading a path that
 * had not existed for some time. A runner that reads nothing does not fail.
 *
 * So this compares byte for byte and names what moved. It runs in the lab and
 * refuses to run here, because "am I a faithful copy" is not a question the
 * original can answer about itself.
 *
 *   MINIMA=../minima node scripts/audit-sync.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { LAYOUT, cssUrl, componentUrl, libUrl, ORDER } from "./sources.mjs"

if (LAYOUT === "registry") {
  console.error("audit-sync runs in the lab — this tree is the thing it compares against")
  process.exit(1)
}

const root = new URL(`${process.env.MINIMA ?? "../minima"}/`, new URL("../", import.meta.url))
if (!existsSync(new URL("registry/minima.css", root))) {
  console.error(
    `no Minima registry at ${root.pathname} — set MINIMA=/path/to/minima. ` +
      `Skipping would leave every copy below unchecked, which is the failure this file is about.`
  )
  process.exit(1)
}

const failures = []
let checked = 0

const compare = (label, here, there) => {
  checked++
  if (!existsSync(here)) return failures.push({ label, detail: "missing from the lab" })
  if (!existsSync(there)) return failures.push({ label, detail: "no longer exists in the registry" })
  const a = readFileSync(here, "utf8")
  const b = readFileSync(there, "utf8")
  if (a === b) return true
  const al = a.split("\n")
  const bl = b.split("\n")
  const differing = al.filter((l, i) => bl[i] !== l).length + Math.abs(al.length - bl.length)
  failures.push({ label, detail: `${differing} line(s) differ from the registry copy` })
}

/* The theme sources. `tailwind` is excluded on purpose and it is the one
   exclusion: the lab has no such file, it inlines those bindings into
   globals.css alongside shadcn's own, so there is nothing to compare against.
   audit-merge proves the two trees still discover the same utility list, which
   is the property that mattered. */
const CSS = ORDER.filter((n) => n !== "tailwind")
for (const name of CSS) compare(`css/${name}`, cssUrl(name), new URL(`src/${name}.css`, root))

/* The components this repo actually claims. Stock shadcn components in the lab
   are not ours and are not compared. */
for (const f of ["button.tsx", "input.tsx", "tabs.tsx", "stat.tsx", "status.tsx"])
  compare(`ui/${f}`, componentUrl(f), new URL(`registry/ui/${f}`, root))

compare("lib/cn.ts", libUrl(), new URL("registry/lib/cn.ts", root))

for (const f of readdirSync(new URL(".upstream/", root)))
  compare(`.upstream/${f}`, new URL(`../.upstream/${f}`, import.meta.url), new URL(`.upstream/${f}`, root))

/* And the runners themselves, which is the whole reason this exists. They are
   byte-identical by design now — sources.mjs holds the only thing that differs
   between the trees — so any difference here is a copy going stale again. */
for (const f of readdirSync(new URL("scripts/", root)).filter((f) => /\.(mjs|js)$/.test(f)))
  compare(`scripts/${f}`, new URL(`./${f}`, import.meta.url), new URL(`scripts/${f}`, root))

/* Canary. Everything above reports "in sync", which is only worth reading if a
   difference is still detectable. */
checked++
const before = failures.length
compare("canary", cssUrl("prose"), new URL("src/type.css", root))
if (failures.length === before)
  failures.push({ label: "canary", detail: "two different files compared equal — this audit cannot see drift" })
else failures.pop()

console.log(
  `${checked} file(s) compared against ${root.pathname.replace(process.env.HOME ?? "", "~")} — ` +
    `${failures.length ? `${failures.length} adrift` : "every copy is byte-identical"}`
)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.label.padEnd(26)} ${f.detail}`)
  console.log("\n  Fix by copying from the registry, or port the change back into it — but not\n  by editing only the lab. That is how the last one got out.\n")
  process.exit(1)
}
console.log("PASS — the lab is a copy, not a fork\n")
