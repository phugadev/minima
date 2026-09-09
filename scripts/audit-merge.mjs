/**
 * Class-merge audit.
 *
 * Every component composes classes through `cn()`, and every merger carries a
 * HARDCODED table of which utility belongs to which CSS property. A custom
 * utility it has not heard of is guessed at, and there are two ways to guess
 * wrong. Both are silent, and this project shipped both.
 *
 *   DROPPED — filed under the wrong property, then displaced by a class from
 *   that group. `text-body` was read as a colour and eaten by
 *   `text-muted-foreground`; the paragraph just rendered at the wrong size.
 *
 *   NOT DISPLACING — given its own private group, so it never collapses with
 *   the stock class it replaces and BOTH survive. The cascade then decides by
 *   stylesheet order rather than by what the author wrote. `rounded-lg
 *   rounded-control-xs` rendered at 10px instead of 8px, and
 *   `<Button className="h-control-lg" />` silently did nothing, because the
 *   override happened to sort earlier.
 *
 * The second is why registry/lib/cn.ts exists: it cannot be fixed by naming,
 * since the point is that a Minima utility must share a group with the stock
 * utility it replaces. This file tests the SHIPPED cn, not a copy of its
 * config, and separately checks that every utility the CSS defines is actually
 * registered in it — a theme token added without a merger entry is the exact
 * shape of both bugs above.
 *
 *   node scripts/audit-merge.mjs
 */
import { readFileSync } from "node:fs"
import { cn } from "../registry/lib/cn.ts"

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")
const CSS = ["type.css", "space.css", "depth.css", "motion.css", "ramps.css", "syntax.css", "tailwind.css"]
  .map(read)
  .join("\n")

const uniq = (a) => [...new Set(a)]

/* Discovered from the CSS, never listed here — a list kept in two places is a
   list that disagrees with itself.
   `partner` is a STOCK utility governing the same property. `foreign` governs
   a different one. Ours must collapse with the first and coexist with the
   second. */
const GROUPS = [
  {
    what: "type scale",
    names: uniq([...CSS.matchAll(/@utility (type-[\w-]+)/g)].map((m) => m[1])),
    partner: "text-sm",
    foreign: "text-muted-foreground",
  },
  {
    what: "duration",
    names: uniq([...CSS.matchAll(/@utility (duration-[\w-]+)/g)].map((m) => m[1])),
    partner: "duration-150",
    foreign: "delay-100",
  },
  {
    what: "radius",
    names: uniq([...CSS.matchAll(/--radius-([\w-]+):/g)].map((m) => `rounded-${m[1]}`)).filter(
      (n) => !/^rounded-(sm|md|lg|xl|2xl|3xl|4xl|none|full)$/.test(n)
    ),
    partner: "rounded-none",
    foreign: "border",
  },
  {
    what: "depth",
    names: uniq([...CSS.matchAll(/--shadow-([\w-]+):/g)].map((m) => `shadow-${m[1]}`)).filter(
      (n) => !/^shadow-(2xs|xs|sm|md|lg|xl|2xl|none)$/.test(n)
    ),
    partner: "shadow-none",
    foreign: "border",
  },
  {
    what: "control size",
    names: uniq([...CSS.matchAll(/--spacing-(control-[\w-]+):/g)].map((m) => `h-${m[1]}`)),
    partner: "h-8",
    foreign: "border",
  },
  {
    what: "control square",
    names: uniq([...CSS.matchAll(/--spacing-(control-[\w-]+):/g)].map((m) => `size-${m[1]}`)),
    partner: "size-8",
    foreign: "border",
  },
  {
    what: "spacing",
    names: uniq([...CSS.matchAll(/--spacing-(inset|gutter|stack|section):/g)].map((m) => `p-${m[1]}`)),
    partner: "p-2",
    foreign: "border",
  },
  {
    what: "gap",
    names: uniq([...CSS.matchAll(/--spacing-(inset|gutter|stack|section):/g)].map((m) => `gap-${m[1]}`)),
    partner: "gap-2",
    foreign: "border",
  },
]

const failures = []
let checked = 0

/* Canary. Everything below reports "all survive", and that is only worth
   reading if this file can still SEE a dropped class. An unknown text-* is
   what the type scale used to be, and a merger with no entry for it must still
   eat it. A passing canary means the detection logic changed and every green
   result underneath quietly stopped meaning anything. */
checked++
if (cn("text-notarealsize", "text-black").split(" ").includes("text-notarealsize"))
  failures.push({
    what: "canary",
    detail: "an unknown text-* is no longer dropped — this audit can no longer detect the bug it exists for",
  })

for (const { what, names, partner, foreign } of GROUPS) {
  if (!names.length) {
    failures.push({ what, detail: "no utilities discovered — this group would pass by doing nothing" })
    continue
  }
  const broken = []
  for (const name of names) {
    /* 1. Not dropped when it meets a different property. */
    checked++
    if (!cn(name, foreign).split(" ").includes(name)) broken.push(`${name} is eaten by ${foreign}`)

    /* 2. Collapses with the stock class it replaces — in BOTH directions, or
          it is not really in the same group. This is also the registration
          test: a theme token added without a cn entry cannot collapse, so it
          fails here. Checking the source TEXT instead was a false positive
          waiting to happen — the control and spacing groups are built by a
          helper and never appear as literals. Test behaviour, not source. */
    checked += 2
    const oursLast = cn(partner, name).split(" ")
    const theirsLast = cn(name, partner).split(" ")
    if (oursLast.length !== 1 || oursLast[0] !== name)
      broken.push(`${partner} + ${name} -> "${oursLast.join(" ")}" (should collapse to ${name})`)
    if (theirsLast.length !== 1 || theirsLast[0] !== partner)
      broken.push(`${name} + ${partner} -> "${theirsLast.join(" ")}" (should collapse to ${partner})`)
  }
  console.log(
    `  ${what.padEnd(15)} ${String(names.length).padStart(2)} utilities — ${broken.length ? `${broken.length} broken` : "registered, collapse both ways"}`
  )
  for (const b of broken.slice(0, 4)) console.log(`      ${b}`)
  if (broken.length) failures.push({ what, detail: `${broken.length} problem(s)` })
}

console.log(`\n${checked} checks — ${failures.length} group(s) failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.what.padEnd(15)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every Minima utility is registered and displaces its stock counterpart\n")
