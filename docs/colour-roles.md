# Colour roles

Two rules, both learned by getting them wrong in the lab. They exist because
"is this contrast floor met?" turned out to be the wrong first question twice
running — the right first question is *what is this thing for*.

## 1. A container is not a mark

The distinction decides which floors apply, and getting it backwards is what
turned amber into gold.

**A bare mark carries meaning on its own.** A status dot in a column with no
label, a lone indicator. If you removed every label on the screen, a bare mark
would still be telling you something. Bare marks must clear **3:1 against the
surface behind them**, and that is what `--{hue}-mark` exists for.

The word *bare* is doing real work. A dot that always sits beside its own label,
or a chart segment with a legend under it, is not carrying the meaning alone —
and size matters too: the 3:1 threshold is calibrated for small graphical
objects, not for a bar segment occupying half a card. Applying it to either one
drags the warm end of the palette down to L 0.490, where amber reads as mustard
and green as olive. **Vivid and labelled beats muddy and technically
compliant.**

**A container holds something that is already legible.** An icon tile, a chip's
tinted ground, a card. Its meaning is carried by the label beside it and the
glyph inside it. A container has **no floor against the page** — only its
*contents* have a floor, against the container.

The failure mode is subtle: holding a container to a mark's floor forces its
colour down the ramp until it clears, and a hue dragged down the ramp stops
being that hue. A dark amber is gold. A dark yellow is olive. You cannot have a
warm hue that is saturated, dark, and still itself — that is a fact about
colour, not a tuning problem.

So nearly everything uses step 9 in **both** modes and keeps its hue. The
mode-dependent mark step is reserved for the one case that earns it — a mark
standing alone, with no label to lean on.

```
tile          solid + on-solid    container    no page floor
chip ground   fill                container    no page floor
chip text     text                text         4.5:1 vs its ground
chip dot      solid               labelled     no page floor
bare mark     mark                bare mark    3:1 vs surface
```

Only the last row earns the floor. Everything above it is either a container or
a mark travelling with its label.

## 2. A tone is a state, never a category

Four stat cards in four different hues — requests blue, latency amber, uptime
green — is colour used as a category label. That is decoration, and this system
spends colour on exactly three jobs: state, identity, data.

`tone` means *this measurement is in a state*. A dashboard where nothing is
wrong should read almost entirely neutral, and the one amber tile should mean
something. Neutral is always available and is the honest default for a number
that is simply a number.

This does not mean "use less colour". Vibrant is fine — **arbitrary** is not.
The test is whether you could explain, in one sentence, why *that* element is
*that* hue. "Latency is degrading" passes. "It's the third card" does not.

## Why these are written down

Both were discovered by building a recipe, looking at it, and finding it ugly —
not by reasoning from the Charter. The contrast audit could not have caught
either one, because both are correct-by-the-numbers and wrong by the eye. That
is the class of rule worth recording: the ones a runner cannot enforce.

## 3. Ask for a role, never a step number

The scale is numbered 1–10 and every step also carries a name — `bg`,
`bg-subtle`, `fill`, `fill-hover`, `fill-active`, `border`, `border-strong`,
`solid`, `text`, `text-strong`.

**Recipes use the names. Only the generator and the ramp view touch numbers.**

The reason is not tidiness. Reducing the scale from twelve steps to ten moved
the solid from 9 to 8 and text from 11 to 9, and every comment, doc and class
that had baked in an ordinal became quietly wrong — four files were still
describing the old numbering afterwards. A name survives a renumber; an
ordinal does not.

## 4. A solid replaces its ground; a tint veils it

Every step on the ramp is opaque, and an opaque colour **erases whatever is
behind it**. That is correct for a page, a card, a filled button — things whose
job is to be a ground. It is wrong the moment you do not know what is behind:
a hover state on a row that might be striped or selected, a hairline crossing a
photograph, a menu floating over a chart.

Six rungs therefore have a translucent twin, named for the job rather than
mirrored from the opaque role — because the job is different:

```
bg-subtle      tint-subtle
fill           tint
fill-hover     tint-hover
fill-active    tint-active
border         hairline
border-strong  hairline-strong
```

Each one is **solved, not chosen**: given the opaque step and a reference
ground, there is exactly one minimum-alpha pair that composites to it. The
reference is pure white in light mode and pure black in dark. So the guarantee
is precise — *over paper, a tint is its opaque twin* — and over anything else
it is the same veil doing the same amount of work, which is what you wanted.

`node scripts/audit-alpha.mjs` composites every value in the shipped CSS and
fails if any of them drifts more than one 8-bit step from the colour it claims
to reproduce.

**Solids and text get no alpha.** They sit at the top of the ramp for a reason:
translucent text is a bug, and a translucent solid quietly breaks the on-solid
guarantee, which is computed against an opaque colour.

### What this does not fix

A veil solved for light mode is dark. Over a dark photograph it disappears, and
no tuning recovers it — it is the same fact as "a warm hue cannot be saturated,
dark, and still itself". Content of genuinely unknown luminance needs a scrim
underneath it, not a cleverer hairline.

And the scrim itself is not symmetric. In light mode it does the whole job: at
45% the dimmed page falls 3.45:1 below a white dialog, which is real
separation. In dark mode it cannot — near-black has nowhere to go, and the same
measurement gives **1.10:1** at 65%. That is not a tuning failure, it is the
range running out. Dark-mode elevation has to be carried by the surface being
*lighter* than the page and by a border, and the scrim's remaining job is only
to quiet what is behind. The audit prints both numbers rather than asserting a
floor, because a floor there would be encoding a fiction.

## 5. Text goes on a fill, never on a tint

The alpha rungs reproduce their opaque twin **over the reference** — paper in
light, ink in dark. Over anything else they composite differently, which is
the entire point of them, and it means a contrast guarantee proved against the
opaque step does not travel with the translucent one.

`node scripts/audit-alpha.mjs` prints the gap every run:

```
red-text   on red-tint   over the card: 4.33:1
pink-text  on pink-tint  over the card: 4.20:1
teal-text  on teal-tint  over the page: 4.33:1
```

Seven hue-and-ground pairs land between 4.20 and 4.48 — under the floor, but
only just, which is exactly what makes it dangerous. It looks fine.

**So a tinted ground with text on it uses `fill`, not `tint`.** The tint is for
surfaces whose ground is genuinely unknown, and text on an unknown ground was
never something the ramps could promise. The destructive button found this the
hard way: it read 4.5:1 on the page and 4.3:1 on a card, and only the card
version shipped.

This is reported rather than enforced, because the numbers are a true statement
about a boundary rather than a defect to fix. The defect would be a recipe that
crosses it.

### How this was nearly missed

The first version of the check parsed `--red-text` directly. That token is an
alias — `var(--red-9)` — so the parse produced `NaN`, and `NaN < 4.5` is
`false`. Every hue passed by never being evaluated at all.

A check that cannot read its input must **fail**, not pass. `audit-alpha` now
throws on a non-literal colour and fails on any non-finite ratio. This is the
second no-op check in this project; the first compared a colour against itself.
Both were only caught by disbelieving a clean result.
