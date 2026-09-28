# Changelog

Minima follows semantic versioning as [docs/1.0.md](docs/1.0.md) defines it:
roles and names are the API, values are not. A renamed or removed name is a
major release; an addition, or a value retuned with every audit still
passing, is a minor; a fix no consumer can see is a patch. Work lands under
`[Unreleased]` until it is released.

## [Unreleased]

## [1.3.0] — 2026-09-28

### Added

- `layout`: a quiet voice. `Section` and `PageHeader` take
  `variant="quiet"` — the label, title and lead all at body size, hierarchy
  carried by colour and space instead of an uppercase label, a rule and a
  display title. The default voice is unchanged. Written because the first
  consumer's redesign dropped the default voice for one it hand-rolled from
  `Container` and a local label component; that site now builds every page
  from the quiet voice, and a text-keyed snapshot of its pages in both modes
  at desktop and phone widths shows no glyph moved.
- `layout`: `containerVariants` gains `size="narrow"`, one column of reading,
  beside `page`. `Section` and `PageHeader` take `size` and pass it to their
  container.

## [1.2.0] — 2026-09-28

### Added

- `palette` registry item: `styles/minima-palette.json`, every colour the
  theme defines — 338 per mode: ramps, roles, the shadcn names, syntax,
  focus — resolved to hex for light and dark, keyed by token name.
  Translucent tokens keep their alpha as 8-digit hex. For the places a CSS
  variable cannot go: emails, Open Graph images, SVG attributes, charts.
  Before this, consumers re-parsed minima.css with regexes of their own —
  three separate resolvers across two projects.
- scripts/build-palette.mjs generates it from the built theme as part of
  `npm run build`.
- audit-palette fails when the committed palette is not what the committed
  theme resolves to (shown by editing one grey without rebuilding: six
  tokens flagged), when the modes carry different tokens, or when a
  translucent token loses its alpha.

## [1.1.0] — 2026-09-28

### Added

- Shiki follows the page's mode. Given both Minima syntax themes, Shiki
  writes each token's colour as `--shiki-light` and `--shiki-dark`; the theme
  now picks the one for the current mode, off `.dark` like everything else.
  It covers both of Shiki's output shapes — its default (an inline light
  colour with `--shiki-dark` beside it) and `defaultColor: false` (the two
  properties alone, which rehype-pretty-code uses) — and the block
  backgrounds. Keyed on the properties Shiki writes, so it touches nothing
  else. Before this every consumer had to write the switch, and one built
  the dark palette on a light page.
- audit-install renders both shapes in both modes and fails the one that
  lands on the wrong mode. Against the 1.0.1 theme it fails three of the
  four; against this one, none.
- docs/install.md shows the two-theme configuration for Shiki and for
  rehype-pretty-code.

## [1.0.1] — 2026-09-28

Documentation and process. No token, utility, component or value changes;
nothing a consumer installs is different.

### Added

- docs/1.0.md, "How a release reaches consumers": the registry serves `main`,
  so every merge to `main` is a release — entries move under a version, the
  version is set in package.json, the merge commit is tagged.
- `audit-changelog` enforces it: on `main` (or with `--release`), an entry
  under `[Unreleased]` or a package.json version that is not the newest
  release fails the audit. On other branches it reports without failing.
- docs/install.md, "Colour, by role": words take `-text`, a dot beside its
  label takes `-solid`, a shape standing alone takes `-mark`, a tinted panel
  takes `-fill`, `-border` and `-text`. `mark` for every dot was a real
  mistake in a consumer — it darkens in light to stand alone, and read muddy
  beside a label.
- docs/install.md, "Check your own pages": Minima's audits cover its own
  pairings, not a consumer's; run `audit:pages` in both modes, because a
  ramp step composed in dark can fail in light — as one consumer's did.

## [1.0.0] — 2026-09-27

The first version. Nothing before it had a number: it was cut when every gate
in docs/1.0.md held at one commit, proven by runners rather than judged. Two
consumers of two kinds — enrictrillo.com, a dark reading site, and Watchman, a
light-and-dark dashboard — install every item from the registry, import all
nine, and are byte-current with it.

### Added

- `layout` registry item — `Container`, `Section`, `PageHeader`, `Eyebrow` —
  extracted from the first site built on Minima. Every gap a space rung, every
  className through `cn`. (#4, 26 Sep)
- `type-lead`, an 18px reading size for the paragraph that opens a page,
  registered with `cn`. (#3, 26 Sep)
- `subtle-foreground`, a third text level between muted and the 4.5:1 floor,
  solved rather than picked; distinct in dark, not in light
  (docs/colour-roles.md §6). (#1, 26 Sep)
- `audit:consumers` — reads every consumer in consumers.json from GitHub and
  checks each installed item is byte-identical to the registry and actually
  imported; reports which items, modes and kinds of project are proven.
- `audit:pages` — every text element on a consumer's real pages against the
  colour painted behind it, in light and dark, at desktop and phone widths;
  plus sideways scroll and the root font size.
- `audit-registry` fails when an item is not documented in docs/install.md by
  its address.
- `audit:pages` takes a Playwright storage state (`STORAGE=`), so pages
  behind a login are measured as a signed-in user sees them.
- `audit:consumers` checks a consumer still in review on its branch and
  reports it as pending, outside coverage, until it reaches its default
  branch. Watchman is the first: a dashboard, light and dark.
- `audit:install` fails when a consumer's root font size is not the reader's
  default, which rescales every rem in the theme. (#2, 26 Sep)
- docs/1.0.md: what 1.0 means, as gates with runners.
- The foundation: ramps, alpha rungs, type registers, space ladder and
  density, depth, motion, state, prose, syntax; `cn`; `button`, `input`,
  `tabs`, `stat`, `status`; twelve runners. (9 Sep)

### Changed

- Light `muted-foreground` is darker: gray step 9 in light moves from 0.52
  (~5.2:1) to 0.44 (~7.3:1). At 0.52 the solved `subtle-foreground` came out
  the same grey as muted, and Watchman's light mode showed it. Both now read
  as distinct levels in both modes. Every muted label in light mode is a
  little darker; every audit still passes.

- The README shows the theme on a real page, stock and Minima side by side,
  in both modes. (10 Sep)
- The shadcn radius scale is anchored to Minima's rungs rather than
  contested; `rounded-sm` and `rounded-lg` land on the mark and control rungs.
  (9 Sep)
- Runner bodies are shared between the registry and the lab through one
  layout-aware module, and audit-sync fails when a copy drifts. (9 Sep)

### Fixed

- Three silent failures a real install exposed, and the QA gap under them.
  (9 Sep)
- `contenteditable` had no focus ring; the focusable list is now checked
  against a real DOM. (9 Sep)
- Components shipped with an unconfigured `cn` that dropped Minima utilities
  in merges; they now ship a configured one. (9 Sep)
- Comments naming a hue (indigo) the palette no longer has.
