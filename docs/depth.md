# Depth

`app/depth.css` covers the mechanism — two-layer shadows, the geometry, why
each mode carries depth differently. This is the part a runner cannot check:
**which rung a thing belongs on.**

## The rung is about behaviour, not importance

```
flat      part of the page          a row, a section, an inline panel
raised    sits on it, stays put     a card, a sticky header
overlay   floats over content       a menu, a popover, a tooltip
modal     floats over everything    a dialog, a sheet — and a scrim
```

The question is never "how important is this". It is **what does this thing do
to the content underneath it**: nothing, nothing, covers it temporarily, or
blocks it entirely. A card is not on a lower rung than a dialog because it
matters less — it is lower because you can still use what is beside it.

The failure mode is depth used as emphasis. A "featured" card given the modal
shadow does not read as important, it reads as a dialog that failed to open.
If a card needs emphasis, that is a job for the border, the surface, or a tone
— the same rule as *a tone is a state, never a category*
(see [colour-roles.md](colour-roles.md)).

## Both modes run out of room, at opposite ends

Light cannot lighten a surface past white; dark cannot darken a shadow past a
page already at 10/255. So light spends its range on the shadow and dark spends
it on the surface, and `node scripts/audit-depth.mjs` prints both every run:

```
light  contact shadow moves the page  248→214, 248→214, 248→214
       surfaces  253, 253, 253  (page 248)     <- no room left
dark   contact shadow moves the page  10→6, 10→6, 10→6      <- no room left
       surfaces  19, 28, 35  (page 10)
```

Read the two "no room left" lines together and the design follows from them.
It is why dark mode ships **one** shadow strength rather than three: the gap
between a raised shadow and a modal one there is about one 8-bit step, so three
values would be encoding a distinction nobody can see.

## Two orders, not one

Surfaces and shadows are ordered differently, and conflating them is a real bug
rather than an inconsistency:

```
by stacking order   raised → modal → overlay     what sits on what
by apparent size    raised → overlay → modal     how big a shadow it casts
```

**Overlay sits above modal.** That looks wrong until you open a select inside a
dialog. A popover can be anchored to anything, a dialog included; a dialog never
opens inside a popover. Give them the same surface and that menu dissolves into
the dialog underneath it — in dark mode, where the surface is the only cue,
it disappears completely.

Shadows keep the intuitive order, because a dialog is a physically bigger
object and casts a bigger shadow wherever it happens to be stacked.

## What the audit cannot tell you

The first version of the light shadows had the contact alpha *decrease* as the
rung climbed. That is physically correct — a higher object casts a weaker, more
diffuse shadow — and on screen it made the modal the faintest of the three,
because the contact layer is what tells the eye an edge is off the page at all.
Weakening it reads as *flatter*, not *further*.

The audit was perfectly happy. It measured peak darkening at the contact point,
reported 248→228, and that number was true. It was simply not the number that
decides whether a shadow is visible. The correction — constant contact alpha,
height carried entirely by the ambient pool — came from putting the three rungs
side by side and looking at them.

So the runner proves a shadow is **well-formed**: two layers, blur beyond
offset, negative spread, growing footprint, identical geometry across modes. It
cannot prove one is **visible**. `MIN_CONTACT_ALPHA` in the audit is that
judgement written down after the fact, so a later retune cannot quietly drift
back under the point where the rungs were last seen to be distinguishable.

This is the same class of rule as *a container is not a mark* in
[colour-roles.md](colour-roles.md): correct by the numbers, wrong by the eye,
and only ever found by building the thing and looking at it.

## What is deliberately absent

**No inset rung.** Pressed states and wells are expressible, but nothing in the
system asks for one yet, and a rung with no consumer is a guess about the
future rather than a decision about the present.

**No tinted shadow.** A cool-tinted shadow is a real quality signal, but it is a
correction for a warm ground. Minima's gray ramp is achromatic (C = 0), so
there is nothing to correct, and adding chroma the palette does not have would
be decoration with no reason behind it.
