/**
 * Where the sources are — the one file that knows the layout.
 *
 * Two trees hold the same design system. This repo authors it in `src/` and
 * ships it from `registry/`; the lab consumes it, with the same CSS under
 * `app/` and the same components under `components/ui/`. Every runner needs to
 * read those files, and until this existed each runner hard-coded the repo's
 * paths — so the lab kept its own edited copies, and copies drift.
 *
 * They did. Eleven runners in the lab fell behind, one of them still reading
 * `../src/app/scales.css`, a path that has not existed for some time. A runner
 * that reads nothing does not fail; it passes, quietly, forever.
 *
 * So the layout is detected once, here, and every runner body is now IDENTICAL
 * in both trees. Syncing them is `cp`, which is the only kind of sync that
 * stays done.
 *
 * `semantic` is the one name that differs — the lab calls that file minima.css
 * — so it is mapped rather than assumed.
 */
import { existsSync, readFileSync } from "node:fs"

const at = (p) => new URL(`../${p}`, import.meta.url)

/* Detected, not configured. A config file is one more thing that can disagree
   with the tree it describes. */
export const LAYOUT = existsSync(at("src/ramps.css")) ? "registry" : "lab"

const REGISTRY = {
  cssDir: "src",
  cssName: (n) => `${n}.css`,
  componentsDir: "registry/ui",
  lib: "registry/lib/cn.ts",
  bundle: "registry/minima.css",
  syntaxTheme: (mode) => `registry/syntax-${mode}.json`,
  registryJson: "registry.json",
}
/* Two names differ in the lab and both are mapped rather than assumed.
   `semantic` is called minima.css there, and `tailwind` is not a file at all —
   the lab inlines the same @theme bindings into globals.css. audit-merge
   discovers its utility list from that source, so leaving it unmapped is not a
   smaller check, it is a crash or, worse, an empty list that passes. */
const LAB = {
  cssDir: "app",
  cssName: (n) =>
    n === "semantic" ? "minima.css" : n === "tailwind" ? "globals.css" : `${n}.css`,
  componentsDir: "components/ui",
  lib: "lib/cn.ts",
  bundle: null,
  syntaxTheme: (mode) => `app/syntax-${mode}.json`,
  registryJson: null,
}
const L = LAYOUT === "registry" ? REGISTRY : LAB

/* The theme's sources, in dependency order. build-theme.mjs concatenates them
   in exactly this order and the lab imports them in it. */
export const ORDER = [
  "ramps",
  "semantic",
  "tailwind",
  "type",
  "space",
  "depth",
  "motion",
  "state",
  "native",
  "prose",
  "syntax",
]

/** A source stylesheet, by logical name — `semantic`, `prose`, `ramps`… */
export const cssUrl = (name) => at(`${L.cssDir}/${L.cssName(name)}`)

/** Read one, and say which file was missing rather than throwing ENOENT.
 *  A runner reading the wrong path is the failure this file exists to stop, so
 *  it has to be loud. `optional` is for sources one layout genuinely lacks. */
export const readCss = (name, { optional = false } = {}) => {
  const url = cssUrl(name)
  if (!existsSync(url)) {
    if (optional) return null
    throw new Error(
      `no source for "${name}" at ${L.cssDir}/${L.cssName(name)} (${LAYOUT} layout) — ` +
        `the check that wanted it would otherwise have read nothing and passed`
    )
  }
  return readFileSync(url, "utf8")
}

export const componentsDir = () => at(L.componentsDir)
export const componentUrl = (file) => at(`${L.componentsDir}/${file}`)
export const componentPath = (file) => `${L.componentsDir}/${file}`
export const libUrl = () => at(L.lib)
export const upstreamDir = () => at(".upstream")
export const syntaxThemeUrl = (mode) => at(L.syntaxTheme(mode))
export const registryJsonUrl = () => (L.registryJson ? at(L.registryJson) : null)

/** The whole theme as one string.
 *
 *  In this repo that is the built file, which is the thing consumers install.
 *  In the lab there is no bundle, so it is the theme sources in import order.
 *
 *  `tailwind` is left out of the lab's version, and the reason is worth stating
 *  because it looked like a bug first: there is no app/tailwind.css, so that
 *  name maps to globals.css — right for discovery (audit-merge finds the same
 *  45 utilities in both trees from it) and wrong for a bundle. globals.css is
 *  the APP's stylesheet. Pulling it in dragged shadcn's `--font-geist-sans`
 *  and `--font-geist-mono` into the cascade audit, which reported them as
 *  dangling. They are — in CSS. next/font defines them on <html> at runtime,
 *  and neither is Minima's to fix. The bindings block itself is token-only and
 *  is audited in this repo, where it exists as a real source. */
export const bundle = () => {
  if (L.bundle && existsSync(at(L.bundle))) return readFileSync(at(L.bundle), "utf8")
  return ORDER.filter((n) => n !== "tailwind")
    .map((n) => readCss(n, { optional: true }))
    .filter(Boolean)
    .join("\n\n")
}
