# Minima

A Tailwind v4 theme for interfaces that stay out of their own way. Neutral
carries the structure; colour is spent on state, identity and data, and nowhere
else.

It ships as **one CSS file**. Add it to an existing shadcn project and the
components you already have pick it up without being edited, because Minima
re-points Tailwind's own radius, shadow, easing and colour scales at its rungs
rather than inventing a parallel set of names.

## Install

```bash
npx shadcn@latest add phugadev/minima/theme
```

Then one line in your global stylesheet, after the Tailwind import:

```css
@import "tailwindcss";
@import "../styles/minima.css";
```

That is the whole adoption cost. The full walkthrough, including what to check
first and what a failed install looks like, is in [docs/install.md](docs/install.md).

Components are separate and optional. Take them when you want them:

```bash
npx shadcn@latest add phugadev/minima/button
npx shadcn@latest add phugadev/minima/tabs
```

They land in your repo as your code, the way shadcn intends. Nothing in the
theme reaches into a component you own.

## What the theme alone gives you

| | |
|---|---|
| **Colour** | Ten OKLCH ramps generated on Radix step semantics, each step named for its role. Alpha rungs solved so a tint reproduces its opaque twin. |
| **Type** | Three registers — reading, signal, figure — plus a prose layer with its own measure and rhythm. |
| **Space** | A 2x ladder (inset, gutter, stack, section) and three density modes. |
| **Depth** | Four rungs, carried by shadow in light and by surface in dark. |
| **Motion** | Four durations, three curves, and reduced motion enforced globally. |
| **State** | Focus, hover, pressed and disabled, with a ring that clears 3:1 on every surface. |
| **Syntax** | A code palette generated from the same ramps, for Prism, highlight.js or Shiki. |

## A few of the decisions

**A container is not a mark.** Only a mark carrying meaning *alone* owes the
page 3:1. Holding a tinted tile to that floor drags warm hues down the ramp
until amber is gold — vivid and labelled beats muddy and technically compliant.

**Ask for a role, never a step number.** Every step has a name (`fill`,
`border`, `solid`, `text`). Renumbering the scale once left four files quietly
wrong; a name survives that, an ordinal does not.

**Text goes on a fill, never a tint.** A tint reproduces its step over paper or
ink only. Seven hue-and-ground pairs land between 4.20 and 4.48 on other
grounds — under the floor, but only just, which is what makes it dangerous.

**Each mode runs out of room at the opposite end.** Light cannot lighten a
surface past white; dark cannot darken a shadow past a page already at 10/255.
So light spends its range on the shadow and dark spends it on the surface.

**The type scale is `type-*`, not `text-*`.** Tailwind's `--text-*` namespace
would be the obvious choice and it is a trap: `cn()` carries a hardcoded list
of font sizes, so a custom `text-body` is filed as a *colour*, collides with
`text-muted-foreground`, and is silently dropped.

## Verified, not asserted

Every rule ships with the thing that proves it. `npm run audit` runs eleven
checks over the built CSS and the registry:

```
ramps       every contrast floor holds across 110 pairings
alpha       every tint reproduces its opaque step within one 8-bit step
depth       two-layer cast shadows on surfaces that carry text
motion      curves face the right way, exits beat entrances
state       the focus ring clears 3:1 on every surface a control can sit on
prose       measure is readable, rhythm groups headings, links are not colour alone
native      the browser knows the scheme, every target clears 24px
syntax      every token is legible on the code ground and none are confusable
components  every component is expressed in tokens, no literals
merge       every utility survives cn()
registry    every item resolves, every dependency is an address
```

`npm run audit:live` adds the two that need a real browser — reduced motion
under media emulation, and focus rings that actually render. It is the only
runner that needs a consuming app, since there is nothing to render here:
`URL=http://localhost:3000 npm run audit:live`.

Each of those exists because something broke. The registry check exists because
bare `registryDependencies` resolve to shadcn's items rather than ours, and an
earlier version of this project shipped that way.

## Development

```bash
npm run build          # ramps, syntax themes, then the bundled theme
npm run audit          # everything above
npm run audit:upstream # has shadcn moved structurally since we forked?
```

Sources live in `src/`. `registry/minima.css` is generated — do not edit it.

Components are forked from shadcn, and `.upstream/` records the exact source
they were forked from. `audit-upstream` compares structurally, blanking every
`className` and `cva()` call, so it reports what *they* changed rather than
what we did.

## Licence

MIT
