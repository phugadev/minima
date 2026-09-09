# Installing Minima

Zero to working, in two steps. The rest of this page is what those two steps
do, what you get, and what it looks like when something has gone wrong.

## Before you start

Minima needs three things, and it is worth checking rather than discovering:

**Tailwind v4.** The theme is written in v4 syntax — `@theme`, `@utility`,
`@layer` — and will not do anything under v3. If your project has a
`tailwind.config.js` and no `@import "tailwindcss"`, you are on v3.

**shadcn initialised.** You need a `components.json`, because that is how the
CLI knows where your project root is and where components belong.

```bash
npx shadcn@latest init
```

**A `.dark` class on `<html>` for dark mode.** Minima keys dark mode off the
same class shadcn and `next-themes` use. If you already have a theme toggle,
it already works.

**`@import "shadcn/tailwind.css"` in your global stylesheet — only if you take
the components.** A recent `shadcn init` writes this line for you. It is where
the `data-horizontal`, `data-vertical` and `data-active` variants are defined,
and shadcn's own tabs — which Minima's is forked from — depend on them. Without
it Tailwind falls back to its built-in `data-horizontal`, which looks for a
`data-horizontal` attribute that Base UI never sets, so the tabs list lays out
sideways and the `line` variant's underline collapses to zero height. Measured,
not guessed: `flex-direction: row` instead of `column`, `height: 0px` instead of
`2px`. Nothing warns you.

If your project was initialised before that line existed, add it. The theme
alone does not need it.

You do **not** need to remove your existing components, or your existing
colours, or anything else. Minima is additive.

## Step 1 — add the theme

```bash
npx shadcn@latest add phugadev/minima/theme
```

One file lands at `styles/minima.css`. It is the whole design system: the
OKLCH ramps, the alpha rungs, type, space, depth, motion, state, prose and
syntax. Roughly 2,300 lines, and every value in it is checked by a runner
before it ships.

## Step 2 — one import line

In your global stylesheet — `app/globals.css` in a Next.js app — add the
import directly under Tailwind's:

```css
@import "tailwindcss";
@import "../styles/minima.css";
```

**Order matters, and it may look wrong.** CSS requires every `@import` to sit
at the top of the file, which puts Minima *above* the `:root` block that
`shadcn init` wrote. Normally that would mean shadcn wins the tie and Minima
does nothing at all.

It does not, because the layer that redefines shadcn's names is emitted as
`:root:root` — the same element at one more point of specificity, which beats a
later `:root` regardless of source order. You do not have to move anything,
reorder anything, or delete anything.

That is the whole installation.

## What you get immediately

Reload and the app should already look different, **without a single component
being edited.** Minima re-points Tailwind's own scales rather than adding a
parallel set of names, so:

- `shadow-sm` gets the raised shadow — a real two-layer cast shadow
- `ease-out` gets Minima's curve
- `bg-card`, `border-border`, `text-muted-foreground` and the rest of shadcn's
  eighteen names resolve to the ramps

### The one exception: radius

`shadcn init` writes its own `@theme` block that re-derives `--radius-sm`
through `--radius-4xl` from a single `--radius` with fixed ratios — and CSS
requires every `@import` at the top of a file, so Minima's `@theme` is *always*
followed by shadcn's. Later wins, and no import position changes that.

Rather than fight it, Minima anchors it: `--radius` points at the control rung,
which puts shadcn's `0.6x` and `1x` steps exactly on the mark and control
rungs — the two its own components actually use.

Measured in a fresh `create-next-app` + `shadcn init -b base -p nova`:

```
rounded-sm    6px   = mark rung      (checkboxes)         ← exact
rounded-md    8px
rounded-lg   10px   = control rung   (buttons, inputs)    ← exact
rounded-xl   14px                    (panel rung is 12px)
rounded-2xl  18px
rounded-3xl  22px
rounded-4xl  26px                    (chip rung is a pill)
```

The two shadcn's own components reach for land on a rung exactly; the other
five are shadcn's numbers. `npm run audit:install` prints that ladder on every
run, so if shadcn changes its ratios this page stops being right out loud
rather than quietly.

If you want every rung exact, delete the seven `--radius-*` lines from the
`@theme inline` block in your `globals.css`. Minima defines them, and with
shadcn's gone its own take effect. That is optional, not required.

Three things you get that are not cosmetic:

- **Scrollbars and native controls follow the theme**, because `color-scheme`
  is declared. Without it a dark app keeps light scrollbars.
- **Every focusable control gets a ring** that clears 3:1 on every surface it
  can sit on, held off the control by an offset so it works on any background.
- **`prefers-reduced-motion` is honoured globally**, including for Tailwind's
  own duration utilities and any keyframes you have.

## Optional — take the components

The theme does not touch components you own. Some of shadcn's have decisions
baked into the file rather than into tokens, and those are shipped separately:

```bash
npx shadcn@latest add phugadev/minima/button
npx shadcn@latest add phugadev/minima/input
npx shadcn@latest add phugadev/minima/tabs
```

They overwrite the equivalent file in `components/ui`. Each is shadcn's
component with its literals replaced by tokens — control heights that follow
density, radius that tracks height, and in the case of `tabs` a selected state
that reads in dark mode, which the stock grey-on-grey track does not.

Two components have no shadcn equivalent:

```bash
npx shadcn@latest add phugadev/minima/stat     # a measurement with a delta
npx shadcn@latest add phugadev/minima/status   # a state, as a chip
```

Each declares `phugadev/minima/theme` and `phugadev/minima/cn` as dependencies,
so adding a component first pulls both in for you.

`cn` is the class merger, taught about Minima's utilities. It is not optional
for the components and it is worth knowing why: every merger carries a
hardcoded table of which utility belongs to which CSS property, and a custom
one it has not heard of gets its own private group. It then never collapses
with the stock class it replaces, both survive, and the stylesheet order
decides instead of your `className` — so `<Button className="rounded-none" />`
works or does not depending on how Tailwind happened to sort that build. With
the configured `cn` it is deterministic: your class always wins.

If you use `cn` from `@/lib/utils` elsewhere, that copy is unaffected. Only
Minima's components import `@/lib/cn`.

## Optional — syntax highlighting

Prism and highlight.js need nothing: the theme binds their class names already.
Write `<pre><code>` inside a `.prose` container and it is styled.

Shiki emits inline styles at build time rather than classes, so it needs a
theme file:

```bash
npx shadcn@latest add phugadev/minima/syntax-shiki
```

```ts
import light from "@/styles/minima-syntax-light.json"
import dark from "@/styles/minima-syntax-dark.json"
```

## Using prose

Prose is a mode you opt into, so a `<code>` in a table cell is not given
article treatment:

```html
<article class="prose">…</article>
```

You get a 68-character measure, vertical rhythm from the line height rather
than the layout ladder, and a body set slightly lighter than headings so
emphasis has somewhere to go.

Prose is a set of **defaults**, so a utility on any element inside it wins:

```html
<article class="prose">
  <h2 class="text-blue-solid">…</h2>   <!-- blue, not the heading colour -->
  <p class="mt-0">…</p>                <!-- 0, not the flow rhythm -->
  <code class="bg-transparent">…</code><!-- transparent, not the tint -->
</article>
```

That is not free — it is why the whole file sits in `@layer components`.
Unlayered CSS outranks every Tailwind layer, so before this it did the
opposite: the class was in the markup and the cascade ignored it.

## Density

Three modes, set with one attribute **on the root element**:

```html
<html data-density="compact">    <!-- or "comfortable"; default is neither -->
```

It scales the four spacing rungs. Control heights deliberately do *not* shrink:
the default ladder already sits on the 24px floor WCAG 2.2 SC 2.5.8 puts under a
pointer target, so there is nowhere below it to go, and an accessibility floor
does not get a preference toggle.

The selector is `:root[data-density=…]`, so this is a whole-document setting.
Putting the attribute on a `<div>` does nothing — a dense region inside a
comfortable page is not something the system currently expresses.

## Overriding things

Minima's own tokens — ramps, spacing, depth, type — sit at plain `:root`, so a
declaration in your own stylesheet after the import wins normally:

```css
:root {
  --rung-panel: 1rem;   /* squarer cards */
  --measure: 76ch;      /* longer prose lines */
}
```

The eighteen shadcn names are the exception, because those are the ones sitting
at `:root:root` to beat shadcn's defaults. Match that specificity:

```css
:root:root {
  --primary: var(--blue-solid);
}
```

Or edit `styles/minima.css` directly. It is in your repo and it is yours — but
it is generated, so a reinstall will overwrite it.

## When it looks like nothing happened

**Everything renders in Times.** shadcn's `@theme` maps `--font-sans` to itself
and nothing defines it. Set it to your actual font variable.

**Colours did not change.** Check the import is *below* `@import "tailwindcss"`
and that the path is right. If `styles/minima.css` does not exist, step 1 did
not complete.

**Utilities like `type-body` or `h-control-md` do nothing.** Tailwind only
generates a utility it can see used in your source. If you are testing from a
console, it will not exist yet.

**Type is the wrong size.** Minima's type scale is `type-*`, not `text-*` —
`type-body`, `type-caption`, `type-label`. This is deliberate: `cn()` carries a
hardcoded list of font sizes, so a custom `text-body` gets filed as a colour,
collides with `text-muted-foreground`, and is silently dropped. `text-*` stays
for colours only.

**Dark mode looks light.** Minima needs `.dark` on `<html>`, not on a wrapper
element.
