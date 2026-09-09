/**
 * Class-merge audit.
 *
 * Every shadcn component composes classes through `cn()`, and `cn` — like
 * tailwind-merge, which the rest of the ecosystem uses — carries a HARDCODED
 * table of which utility belongs to which group. A custom utility it has never
 * heard of gets guessed at, and a wrong guess means the class is silently
 * dropped when it meets one from the group it was mistaken for.
 *
 * That is not hypothetical. The type scale originally shipped as text-display,
 * text-body and so on, using Tailwind's --text-* namespace. `cn` does not
 * recognise those as font sizes, so it filed them under text-COLOUR:
 *
 *   cn("text-body font-medium text-muted-foreground")
 *     -> "font-medium text-muted-foreground"
 *
 * No error. The paragraph just renders at the wrong size. All eleven sizes
 * broke this way and nothing in the project could see it, because every runner
 * we had reads CSS and this happens in JavaScript at render time.
 *
 *   node scripts/audit-merge.mjs
 *
 * The partner column is the point: a utility is only eaten when it meets a
 * class from the group it was misfiled into, so each one is tested against a
 * stock utility sharing its prefix.
 */
import { readFileSync } from "node:fs"
import { cn } from "cn"

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")
const CSS = ["type.css", "space.css", "depth.css", "motion.css", "ramps.css", "syntax.css", "tailwind.css"]
  .map(read)
  .join("\n")

/* The invariant is narrow and worth stating exactly, because the first version
   of this file got it wrong: a utility being displaced by another class from
   the SAME group is correct — that is what a merger is for, and bg-black
   should absolutely beat bg-gray-reading. The bug is a utility being displaced
   by a class governing a DIFFERENT property, which only happens when cn has
   misfiled it.
   
   So every partner below changes something ours does not. */
const GROUPS = [
  {
    what: "type scale",
    names: [...CSS.matchAll(/@utility (type-[\w-]+)/g)].map((m) => m[1]),
    /* The exact pairing that was broken: a size meeting a colour. */
    partners: ["text-muted-foreground", "text-black"],
  },
  {
    what: "duration",
    names: [...CSS.matchAll(/@utility (duration-[\w-]+)/g)].map((m) => m[1]),
    partners: ["delay-100", "ease-linear"],
  },
  {
    what: "radius",
    names: [...new Set([...CSS.matchAll(/--radius-([\w-]+):/g)].map((m) => `rounded-${m[1]}`))],
    partners: ["border", "shadow-none"],
  },
  {
    what: "shadow",
    names: [...new Set([...CSS.matchAll(/--shadow-([\w-]+):/g)].map((m) => `shadow-${m[1]}`))],
    partners: ["border", "rounded-none"],
  },
  {
    what: "control size",
    names: [...CSS.matchAll(/--spacing-(control-[\w-]+):/g)].flatMap((m) => [`h-${m[1]}`, `size-${m[1]}`]),
    partners: ["p-2", "border"],
  },
  {
    what: "spacing",
    names: [...CSS.matchAll(/--spacing-(inset|gutter|stack|section):/g)].flatMap((m) => [
      `p-${m[1]}`,
      `gap-${m[1]}`,
      `mt-${m[1]}`,
    ]),
    partners: ["border", "text-black"],
  },
  {
    what: "colour",
    names: ["gray-reading", "gray-tint", "red-text", "surface-raised", "control-track"].flatMap((n) => [
      `bg-${n}`,
      `text-${n}`,
    ]),
    /* A background paired with a text colour and vice versa — different
       properties, so both must survive. */
    partners: ["underline", "border"],
  },
]

const failures = []
let checked = 0

/* Canary. Everything below reports "all survive", and that sentence is only
   worth reading if this file can still SEE a dropped class. An unknown text-*
   is exactly what the type scale used to be, and cn must still eat it — if
   this ever stops being true, the detection logic has changed and every green
   result underneath became meaningless without anyone noticing. A passing
   canary is a failure. */
checked++
if (cn("text-notarealsize", "text-black").split(" ").includes("text-notarealsize"))
  failures.push({
    what: "canary",
    detail: "cn no longer drops an unknown text-* — this audit can no longer detect the bug it exists for",
  })

for (const { what, names, partners } of GROUPS) {
  if (!names.length) {
    failures.push({ what, detail: "no utilities discovered — this group would pass by doing nothing" })
    continue
  }
  const lost = []
  for (const name of names) {
    checked++
    if (!cn(name, "sr-only").split(" ").includes(name)) lost.push(`${name} vanishes on its own`)
    for (const partner of partners) {
      checked++
      if (!cn(name, partner).split(" ").includes(name)) lost.push(`${name} is eaten by ${partner}`)
    }
  }
  console.log(`  ${what.padEnd(13)} ${String(names.length).padStart(2)} utilities — ${lost.length ? `${lost.length} broken` : "all survive"}`)
  for (const l of lost.slice(0, 5)) console.log(`      ${l}`)
  if (lost.length) failures.push({ what, detail: `${lost.length} utility/utilities dropped by cn()` })
}

console.log(`\n${checked} checks — ${failures.length} group(s) failing`)
if (failures.length) {
  console.log("")
  for (const f of failures) console.log(`  ${f.what.padEnd(13)} ${f.detail}`)
  console.log("")
  process.exit(1)
}
console.log("PASS — every Minima utility survives cn()\n")
