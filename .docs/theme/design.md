# Feature Design — Theming

**Status:** Approved
**Last updated:** 2026-09-04
**Requirements:** FR-9 · **Parent:** [`../DESIGN.md`](../DESIGN.md)

The requirement asks that a theme change how the view is *seen*, not merely its colours. So a theme
here carries spacing, type scale, radius, line weight and motion as well as palette — Dense is a
genuinely different reading experience, not a recolour.

---

## 1. Three composing axes

```
theme    ∈ { calm, bold, dense }     character: spacing, type, radius, motion, geometry
mode     ∈ { light, dark, system }   surface and text colour ramps
density  ∈ { comfortable, compact }  multiplier over spacing and row heights
```

They compose rather than multiply: three themes × two modes × two densities is one resolution
function, not twelve stylesheets.

Resolution sets attributes on `<html>`, and CSS custom properties cascade from there:

```html
<html data-theme="calm" data-mode="dark" data-density="comfortable">
```

## 2. Tokens

```css
:root[data-theme="calm"] {
  --space-unit:    8px;
  --radius:        8px;
  --type-scale:    1.20;
  --font-size-base: 15px;
  --line-weight:   2px;      /* timeline */
  --point-radius:  5px;      /* timeline */
  --row-height:    44px;
  --motion:        160ms;
  --border-weight: 1px;
}

:root[data-theme="bold"] {
  --space-unit:    10px;
  --radius:        14px;
  --type-scale:    1.33;
  --font-size-base: 16px;
  --line-weight:   3.5px;
  --point-radius:  7px;
  --row-height:    56px;
  --motion:        260ms;
  --border-weight: 2px;
}

:root[data-theme="dense"] {
  --space-unit:    4px;
  --radius:        4px;
  --type-scale:    1.12;
  --font-size-base: 13px;
  --line-weight:   1.5px;
  --point-radius:  3.5px;
  --row-height:    28px;
  --motion:        100ms;
  --border-weight: 1px;
}

:root[data-density="compact"] {
  --space-unit: calc(var(--space-unit) * 0.75);
  --row-height: calc(var(--row-height) * 0.8);
}
```

Colour tokens resolve on the mode axis — surfaces, text ramps, borders, and the accent — while the
task colour palette stays constant across modes, tuned to stay distinguishable on both light and
dark grounds.

**Components read variables only.** A hard-coded colour or pixel spacing silently breaks one theme
and nothing else catches it, so a lint rule rejects literal colours and pixel spacing in component
styles (DD-8).

The timeline reads `--row-height`, `--line-weight` and `--point-radius` when computing geometry, so
switching theme reflows the chart without touching its code.

## 3. The three themes

**Calm** — the default, built first and completely. Restrained palette, generous whitespace, strong
typographic hierarchy, minimal motion. The reference implementation every component is built
against.

**Bold** — saturated task colours, heavier weights, larger radii, pronounced motion. The timeline
becomes a striking centerpiece; lines are thick and points large.

**Dense** — reduced spacing, smaller type, tight rows. Maximises tasks visible at once, and turns
the timeline into a compact multi-month overview.

Bold and Dense are added *after* Calm is complete, as token files rather than component changes
(FR-9.2). If either needs a component altered, that is a signal the component is under-tokenised —
fix the component, not the theme.

## 4. Persistence — FR-9.4

Preferences live in `settings` server-side, so they follow the user across devices, and are mirrored
to `localStorage`. A small inline script in the document head reads `localStorage` and sets the
attributes before first paint, avoiding a flash of the wrong theme while the API call is in flight.
The server response reconciles afterwards.

`mode: system` follows `prefers-color-scheme` live, without a reload.

## 5. Settings UI

A Settings view with a live preview: theme as three cards showing a miniature task row and timeline
fragment in each, mode as a three-way toggle, density as a two-way toggle. Changes apply
immediately — no save button (FR-10.3).

## 6. Accessibility

- Contrast meets WCAG AA in every theme and mode combination, verified for text and for task
  colours against their surfaces.
- `prefers-reduced-motion` collapses `--motion` to `0ms` regardless of theme.
- Task colour is never the sole carrier of meaning; status is also conveyed by line style and by
  text.
- Focus rings are tokenised and visible in all themes.

## 7. Testing — FR-9

| Case | Requirement |
| --- | --- |
| Each theme applies and changes measurable geometry | FR-9.2 |
| Light, dark and system modes apply | FR-9.1 |
| System mode follows `prefers-color-scheme` | FR-9.1 |
| Density changes row height | FR-9.3 |
| Choice persists across reload | FR-9.4 |
| No flash of the wrong theme on load | §4 |
| Timeline geometry responds to theme tokens | §2 |
| Reduced motion honoured | §6 |

The lint rule against hard-coded values runs in CI, since it is the only thing standing between the
token system and slow erosion.
