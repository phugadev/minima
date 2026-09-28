/**
 * Palette — is the hex a consumer installs the theme they install?
 *
 * registry/minima-palette.json is generated from registry/minima.css. A
 * generated file that falls behind its source is worse than no file: it is
 * a second, quieter palette that looks authoritative. So:
 *
 *   in sync    the committed JSON is exactly what build-palette produces
 *              from the committed theme — change the theme without
 *              rebuilding and this fails
 *   complete   light and dark carry the same tokens, so no consumer ever
 *              looks a colour up in one mode and gets nothing in the other
 *   honest     translucent tokens keep their alpha (8-digit hex); flattening
 *              one onto a guessed ground would claim a colour it is not
 *
 *   node scripts/audit-palette.mjs
 */
import { readFileSync } from "node:fs"
import { LAYOUT } from "./sources.mjs"
import { buildPalette, PALETTE, THEME } from "./build-palette.mjs"

if (LAYOUT !== "registry") {
  console.log("audit-palette runs in the registry — nothing to check here\n")
  process.exit(0)
}

const failures = []
let checked = 0
const committed = JSON.parse(readFileSync(PALETTE, "utf8"))
const fresh = buildPalette(readFileSync(THEME, "utf8"))

for (const mode of ["light", "dark"]) {
  const a = committed[mode] ?? {}
  const b = fresh[mode]
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    checked++
    if (a[name] !== b[name])
      failures.push(`${mode.padEnd(5)} ${name.padEnd(28)} committed ${a[name] ?? "—"}, theme resolves to ${b[name] ?? "—"} — run npm run build`)
  }
}

const lightKeys = Object.keys(fresh.light)
const darkKeys = new Set(Object.keys(fresh.dark))
checked++
const oneSided = [...lightKeys.filter((k) => !darkKeys.has(k)), ...[...darkKeys].filter((k) => !(k in fresh.light))]
if (oneSided.length) failures.push(`only one mode carries ${oneSided.slice(0, 5).join(", ")}${oneSided.length > 5 ? " …" : ""}`)

const THEME_CSS = readFileSync(THEME, "utf8")
for (const name of lightKeys) {
  const declared = THEME_CSS.match(new RegExp(`--${name}:\\s*(rgb\\([^)]*/[^)]*\\))`))
  if (!declared) continue
  checked++
  if (fresh.light[name].length !== 9) failures.push(`${name} is translucent in the theme but not in the palette`)
}

console.log(`palette     ${lightKeys.length} colours per mode`)
console.log(`\n${checked} checks — ${failures.length} failing`)
if (failures.length) {
  console.log("")
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`)
  if (failures.length > 20) console.log(`  … and ${failures.length - 20} more`)
  console.log("")
  process.exit(1)
}
console.log("PASS — the palette is the theme, in both modes, alpha kept\n")
