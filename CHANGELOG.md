# Changelog

Minima has no version yet. Everything lands here under `[Unreleased]` until
the gates in [docs/1.0.md](docs/1.0.md) hold, and the first number anyone sees
is the one those gates earn. After 1.0 this follows semantic versioning as
that document defines it: roles and names are the API, values are not.

## [Unreleased]

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
