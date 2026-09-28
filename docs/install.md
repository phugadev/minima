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

**The root left at the reader's size.** Every size in Minima is a `rem`, so
anything that sets `font-size` on `html` or `:root` rescales the whole theme —
type, space, radius, control heights — and nothing looks broken, just small.
Older design systems do this to set a body size. A site that came from one
ran every Minima token at 14/16 for three weeks. Check it:

```js
getComputedStyle(document.documentElement).fontSize   // the browser default, 16px unless the reader changed it
```

If it is not, set the root back to `100%` and put the size you wanted on
`body` instead. `npm run audit:install` fails on this.

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
  That covers links, buttons, inputs, selects, textareas, `summary`, anything
  with `tabindex`, and `contenteditable`. `iframe`, `video` and `audio` are
  left to the browser on purpose — they are media, not controls, and a ring
  held off a video player is not the same object as a ring around a button.
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

Three have no shadcn equivalent:

```bash
npx shadcn@latest add phugadev/minima/stat     # a measurement with a delta
npx shadcn@latest add phugadev/minima/status   # a state, as a chip
npx shadcn@latest add phugadev/minima/layout   # the page and its regions
```

`layout` is four primitives in one file — `Container`, `Section`,
`PageHeader` and `Eyebrow` — taken from the first site built on Minima rather
than designed ahead of one. Every gap in them is a rung of the space ladder, so
a page built from them follows `data-density` with no further work:

```tsx
<PageHeader eyebrow={<Eyebrow>Writing</Eyebrow>} title="Notes" lead="One paragraph on why." />
<Section label="Latest" aside="12 posts">…</Section>
```

`Section` puts one section rung above itself and none below, so two regions
sit one rung apart, not two. `containerVariants()` gives the page column to
any element that is not a `Container`.

`Section` and `PageHeader` speak in one of two voices. The default is the one
above — a small uppercase label over a rule, a display-size title and a lead.
`variant="quiet"` drops all of it to the reading size: the section label is a
line of body text in the subtle colour, the title is body text in the
foreground, the lead is a paragraph. It is for a page whose hierarchy is carried
by space and colour rather than size — a personal site, a long read — where the
default voice reads as a product page:

```tsx
<PageHeader variant="quiet" size="narrow" title="Writing" lead="Notes, newest first." />
<Section variant="quiet" size="narrow" label="Work">…</Section>
```

The voice changes only type and colour. Spacing stays on the ladder, so both
voices follow `data-density` and can share a page. `size` picks the column on
all three: `page` (the default, wide enough for a grid of panels) or `narrow`
(one column of reading).

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

Give Shiki **both** themes and the colours follow the page — light by default,
dark wherever `.dark` is on the root — with nothing else to write:

```ts
// Shiki
codeToHtml(code, { lang, themes: { light, dark } })

// rehype-pretty-code
[rehypePrettyCode, { theme: { light, dark }, keepBackground: false }]
```

Shiki writes each token's colour for both modes as `--shiki-light` and
`--shiki-dark`; the theme picks the one for the current mode. Passing a single
theme is what puts the dark palette on a light page — pale tokens on white — so
give it both even if your site is dark-only today.

## Optional — the palette, as hex

Some places cannot read a CSS variable: an email (clients strip them), an Open
Graph image (satori renders outside a browser), an SVG `fill` attribute, a
chart library that wants a string. For those, take the palette:

```bash
npx shadcn@latest add phugadev/minima/palette
```

It lands at `styles/minima-palette.json`: every colour the theme defines —
ramps, roles, the shadcn names, syntax, focus — resolved to hex for both modes,
keyed by token name without the `--`:

```ts
import palette from "@/styles/minima-palette.json"

palette.light["foreground"]      // "#121212"
palette.dark["amber-solid"]      // "#e68d00"
palette.light["border"]          // "#01010124" — translucent tokens keep their alpha
```

It is generated from the same build as the theme and checked against it, so
it cannot drift. Re-add it whenever you re-add the theme. Reach for it only
where a variable cannot go — in the DOM, the CSS variable is still the right
answer, because it follows the mode and this does not.

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

## Colour, by role

Every hue comes in the same roles. Pick by what the colour is doing, never by
which step looks right on the screen you happen to be looking at — the steps
are tuned per mode, and one that looks right in dark can be the wrong one in
light.

| You are colouring | Use | Why |
|---|---|---|
| Words | `text-{hue}-text` | the step that stays legible as text in both modes |
| A dot or shape **beside its label** | `bg-{hue}-solid` | keeps the hue in both modes; the label carries the meaning, so the dot owes no contrast floor of its own |
| A shape **standing alone** — no label | `bg-{hue}-mark` | darkens in light to hold 3:1 by itself; next to a label that makes it read muddy |
| A tinted panel with words on it | `bg-{hue}-fill border-{hue}-border text-{hue}-text` | text goes on a fill, never on a tint |

The one people get wrong is the second row: reaching for `mark` for every dot.
It was built for a mark with nothing beside it to explain it. The reasoning
for all four is in [colour-roles.md](colour-roles.md).

## Check your own pages

Minima's audits prove every pairing Minima itself makes. They cannot see the
ones you make — a quiet grey you compose from a ramp step, a label on a chip
of your own, text on a colour you mixed. Those are only visible on the page,
and they are mode-sensitive: a grey step that reads 4.7:1 on a dark page can
read 3.2:1 on a light one. A consumer built exactly that, dark-first, and it
was only caught by measuring the light pages.

So measure the pages, in both modes, at a desktop and a phone width:

```bash
URL=http://localhost:3000 PAGES=/,/blog,/about npm run audit:pages
```

It checks every piece of text against the colour actually painted behind it,
translucent layers included, and fails anything under 4.5:1 (3:1 for large
text); it also fails a page that scrolls sideways on a phone, and a root font
size that is not the reader's. Both modes are the default; for pages behind a
login, pass a saved session with `STORAGE=./session.json`. Run it from a
checkout of this repository — it is a runner, not something you install.

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
