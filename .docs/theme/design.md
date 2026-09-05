# Feature Design — Theming

**Status:** Approved
**Last updated:** 2026-09-05
**Requirements:** FR-9 · **Parent:** [`../DESIGN.md`](../DESIGN.md)

The requirement asks that a theme change how the view is *seen*, not merely its colours. It does
that through palette, typeface and depth — while **how much fits on screen** is a separate axis
entirely, owned by density.

---

## 1. Three composing axes

```
theme    ∈ { calm, neon }            visual character: palette, typeface, glow
mode     ∈ { light, dark, system }   surface and text colour ramps
density  ∈ { comfortable, compact }  how much fits on screen
```

**Theme and density are separate concerns (DD-21).** An earlier design had three themes — Calm,
Bold and Dense — that differed mainly in spacing and type scale, which is exactly what density
already controls. Two knobs were doing one job, and neither changed how the app actually looked.
Now density owns every size decision, and a theme changes only how the app *feels*.

They compose rather than multiply: two themes × three modes × two densities is one resolution
function, not twelve stylesheets. Resolution sets attributes on `<html>`, and CSS custom properties
cascade from there:

```html
<html data-theme="neon" data-mode="dark" data-density="comfortable">
```

## 2. Tokens

```css
/* Sizing lives on the density axis alone. */
:root                         { --space-unit-base: 8px; --density-factor: 1; }
:root[data-density='compact'] { --density-factor: 0.76; }
:root {
  --space-unit:  calc(var(--space-unit-base) * var(--density-factor));
  --row-height:  calc(var(--row-height-base) * var(--density-factor));
}

/* Themes carry palette, typeface and depth — never measurements. */
:root[data-theme='calm'] {
  --font-display: 'Inter', system-ui, sans-serif;
  --accent: #3d63dd;
  --ground-gradient: none;
  --accent-glow: transparent;
}
:root[data-theme='neon'] {
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --accent: #635bff;
  --accent-glow: rgb(99 91 255 / 0.3);
  --ground-gradient: radial-gradient(1200px 700px at 12% -8%, rgb(99 91 255 / 0.1), transparent 60%);
}
```

**Derive, never self-reference.** The public geometry tokens come from a base value times a factor.
Writing `--space-unit: calc(var(--space-unit) * 0.76)` instead is a self-reference, which CSS makes
invalid at computed-value time: the token silently unsets and compact density does nothing at all.
That bug shipped in an earlier revision and is why the derivation is explicit.

**Components read variables only.** A hard-coded colour or pixel spacing silently breaks one theme
and nothing else catches it (DD-8).

Colour tokens resolve on the mode axis — surfaces, text ramps, borders and the accent. The task
colour palette is a theme token too: Calm's is tuned for a warm light ground, Neon's is saturated
and luminous.

The timeline reads `--timeline-row-height`, `--line-weight` and `--point-radius` when computing
geometry, so switching theme or density reflows the chart without touching its code.

## 3. The three themes

**Calm** — restrained and editorial. A warm off-white ground, Inter throughout, a single blue
accent, minimal motion. Gets out of the way.

**Neon** — vibrant and luminous. Space Grotesk for headings against Inter for body text, saturated
violet and magenta accents, and an ambient gradient wash behind the whole page. In dark mode the
ground is near-black with pools of colour behind it.

### 3.1 Typography carries the theme

Each theme names its own typeface, and this does more than any other single choice to set a mood:
a UI in the system stack alone reads as unfinished however good its colour is. Calm uses Inter for
everything; Neon pairs Space Grotesk headings — geometric and slightly technical — with Inter body
text. Both load from Google Fonts with a full system fallback, so nothing shifts if they fail.

### 3.2 Luminance, not glass (DD-22)

Neon's energy comes from saturated colour, gradients and glow rather than heavy backdrop blur.
`backdrop-filter` forces the compositor to re-rasterise on every frame, which would cost most
exactly where this app must stay smooth — timeline panning and drag-to-reorder. Blur appears only on
surfaces that genuinely float and do not scroll.

## 4. Persistence — FR-9.4

Preferences live in `settings` server-side, so they follow the user across devices, and are mirrored
to `localStorage`. A small inline script in the document head reads `localStorage` and sets the
attributes before first paint, avoiding a flash of the wrong theme while the API call is in flight.
The server response reconciles afterwards.

`mode: system` follows `prefers-color-scheme` live, without a reload.

## 5. Settings UI

A Settings view with a live preview: each theme as a card showing a miniature task row and timeline
fragment in its own palette, mode as a three-way toggle, density as a two-way toggle. Changes apply
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
| Each theme applies, changing palette and typeface | FR-9.2 |
| Density changes row height, independent of theme | FR-9.3, DD-21 |
| Light, dark and system modes apply | FR-9.1 |
| System mode follows `prefers-color-scheme` | FR-9.1 |
| Choice persists across reload | FR-9.4 |
| No flash of the wrong theme on load | §4 |
| Timeline geometry responds to theme tokens | §2 |
| Reduced motion honoured | §6 |

The lint rule against hard-coded values runs in CI, since it is the only thing standing between the
token system and slow erosion.
