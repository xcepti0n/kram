# Feature Design — TaskTracker

**Status:** Approved
**Last updated:** 2026-09-04
**Parent:** [`../DESIGN.md`](../DESIGN.md) · **Requirements:** [`../BRD.md`](../BRD.md)

This document covers the mechanics that are not obvious from the architecture: the API surface, the
ordering algorithm, timeline geometry, date handling, and the theme token system. Each section
names the requirements it satisfies.

---

## 1. API surface

All routes are same-origin under `/api`. Request and response bodies are validated by Zod schemas in
`shared/`, so the client and server agree by construction (DD-9).

### 1.1 Pages — FR-6

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/pages` | All pages, ordered by `position` |
| `POST` | `/api/pages` | Create. Body `{ name, colour? }`; colour auto-assigned when omitted |
| `PATCH` | `/api/pages/:id` | Rename or recolour |
| `PATCH` | `/api/pages/:id/position` | Reorder. Body `{ after_id }` or `{ before_id }` |
| `DELETE` | `/api/pages/:id` | Requires `?tasks=move&to=<page_id>` or `?tasks=delete` (FR-6.3) |

Deleting a page without the `tasks` parameter is a `400`. Tasks are never silently destroyed.

### 1.2 Tasks — FR-1, FR-2, FR-4, FR-7, FR-8

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/tasks?page_id=&include_done=` | Tasks for a page, ordered by `position` |
| `GET` | `/api/tasks/:id` | One task with its status updates |
| `POST` | `/api/tasks` | Create. Only `title` is required (FR-1.1) |
| `PATCH` | `/api/tasks/:id` | Any mutable field, including `created_on` (FR-2.2) |
| `PATCH` | `/api/tasks/:id/position` | Reorder within, or move between, pages |
| `POST` | `/api/tasks/:id/complete` | Sets `completed_on`, defaulting to today |
| `POST` | `/api/tasks/:id/reopen` | Clears `completed_on` |
| `DELETE` | `/api/tasks/:id` | Soft-delete, retained 30 days to back undo (FR-10.5) |

Creation defaults, applied server-side so the client can post a bare title:

```jsonc
{
  "title":       "required, 1–500 chars",
  "page_id":     "defaults to the caller's first page",
  "created_on":  "defaults to today (FR-2.1); any past or future date accepted",
  "colour":      "next unused colour in the palette (FR-5.5)",
  "position":    "LexoRank key placing it at the top of its page (FR-7.3)"
}
```

New tasks land at the **top** of the list, not the bottom: the stated intent is finishing the top
ones first, so a newly captured task is immediately visible rather than buried.

### 1.3 Status updates — FR-3

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/tasks/:id/updates` | Body `{ body, occurred_on? }`; date defaults to today |
| `PATCH` | `/api/updates/:id` | Edit text or date (FR-3.3) |
| `DELETE` | `/api/updates/:id` | Soft-delete, undoable |

An update's `occurred_on` may precede the task's `created_on`. Rather than reject it, the timeline
extends the task's line back to the earliest update — recording reality matters more than enforcing
a rule the user did not ask for.

### 1.4 Timeline — FR-5

`GET /api/timeline?from=&to=&page_ids=&include_done=`

One request returns everything the view needs, avoiding an N+1 of per-task update fetches:

```jsonc
{
  "range": { "from": "2026-08-01", "to": "2026-09-04" },
  "pages": [ { "id": "…", "name": "Home Server", "colour": "#…" } ],
  "tasks": [
    {
      "id": "…", "title": "Build app", "colour": "#…",
      "page_id": "…",
      "created_on": "2026-08-12",
      "completed_on": null,
      "updates": [
        { "id": "…", "occurred_on": "2026-08-19", "body": "Added backend" },
        { "id": "…", "occurred_on": "2026-09-02", "body": "Added frontend with theme" }
      ]
    }
  ]
}
```

Tasks are included when their span intersects the requested range, so a long-running task started
before `from` still renders, with its line clipped at the viewport edge.

### 1.5 Settings — FR-9

`GET` and `PATCH /api/settings`. Theme, colour mode, density and `hide_done` persist server-side so
preferences follow the user across devices; the active choice is also mirrored to `localStorage` to
avoid a flash of the wrong theme on load.

---

## 2. Ordering — FR-7 (DD-6)

`position` is a lexicographically sortable string. To place a task between two neighbours, generate
a key strictly between theirs; only the moved row is written.

```
before:  "a"           after: "c"          → new key "b"
before:  "a"           after: "b"          → new key "an"
before:  (none, top)   after: "a"          → new key "Z"
before:  "z"           after: (none, end)  → new key "za"
```

The algorithm is midpoint generation over a base-62 alphabet. Keys grow by roughly one character per
repeated insertion at the same point; a rebalance renumbers a page's tasks evenly when any key
exceeds 32 characters — expected to be rare, and triggered lazily on write.

**Client behaviour.** `dnd-kit` provides drag with touch, mouse and keyboard support (NFR-2.2). On
drop, the list reorders optimistically and `PATCH /position` is sent with the neighbouring ids
rather than an index, so a concurrent change elsewhere cannot silently misplace the task.

**Cross-page moves.** The same endpoint accepts a `page_id`, so dragging a task onto a different
page in the sidebar both moves and positions it in one write.

---

## 3. Timeline geometry — FR-5 (DD-5)

### 3.1 Scale

A single linear scale maps dates to pixels:

```
x(date) = (date − range.from) / (range.to − range.from) × plotWidth
```

Zoom (FR-5.7) alters `range`, not the transform, so points and lines stay geometrically exact at
every level and text never scales. Four levels — day, week, month, quarter — set both the range
width and the axis tick interval.

### 3.2 Layout

```
 ┌──────────┬────────────────────────────────────────────────────┐
 │ (sticky) │  Aug 12    Aug 19    Aug 26    Sep 2               │  ← axis, sticky top
 │  names   │    │         │         │         │                 │
 ├──────────┼────┼─────────┼─────────┼─────────┼─────────────────┤
 │ Build app│    ●─────────●─────────────────────●──────────────▶│  ← open: arrow cap
 │ Garden   │    ●───────────────────◆                           │  ← done: diamond cap
 │ Taxes    │              ●─────────●                           │
 └──────────┴────────────────────────────────────────────────────┘
                                              ┊
                                           today marker
```

Row height, line thickness, point radius and axis type size all come from theme tokens, so Dense
renders a compact chart and Bold a dramatic one from identical geometry code (DD-8).

The name column is sticky horizontally; the axis is sticky vertically. Both survive panning, so a
row is always identifiable.

### 3.3 Interaction

- **Pan** — horizontal drag, trackpad scroll, or arrow keys.
- **Zoom** — `+` / `−`, pinch, or `Ctrl`+scroll, anchored on the cursor so the date under the
  pointer stays put.
- **Point hover or tap** — raises a card with the update's text and date (FR-5.6). Each point is a
  focusable SVG element, so the same card is reachable by keyboard.
- **Name click** — opens the task's side sheet.
- **Overlap** — when two updates fall within one point-diameter, they collapse into a single marker
  badged with the count, expanding on interaction. Without this, a busy week becomes an unreadable
  smear.

### 3.4 Grouping in Overview — FR-6.5

On the Overview timeline, rows are grouped by page under a collapsible header carrying the page's
colour. Within a group each task keeps its own colour, so a task is identifiable both by its page
and individually. Groups can be collapsed to a single summary row that shows the page's aggregate
span — useful when scanning many pages at once.

---

## 4. Dates — FR-2, FR-3, FR-10.6

**Storage.** `created_on`, `completed_on` and `occurred_on` are `DATE` columns holding `YYYY-MM-DD`,
with no time component and no timezone. These are calendar days as the user means them; storing an
instant would make a task drift to the previous day when read in another timezone.

Audit columns (`created_at`, `updated_at`) are UTC timestamps and are never shown.

**Input.** One `DateInput` component backs every date field. It accepts:

- typed natural language — `today`, `yesterday`, `3 Aug`, `last monday`, `12/8`
- a calendar picker for pointer and touch
- arrow keys to step by day

Parsing is deterministic and local — a small parser over a fixed grammar, not a natural-language
library — so behaviour is predictable and offline. Unparsed input leaves the previous value intact
and marks the field, rather than silently guessing.

---

## 5. Theme tokens — FR-9 (DD-8)

Three axes compose at runtime:

```
theme    ∈ { calm, bold, dense }     → character: spacing, type scale, radius, motion
mode     ∈ { light, dark, system }   → colour surface and text ramps
density  ∈ { comfortable, compact }  → multiplier on spacing and row heights
```

Resolution sets attributes on `<html>`; CSS custom properties cascade from there:

```css
:root[data-theme="calm"] {
  --space-unit: 8px;      --radius: 8px;
  --type-scale: 1.20;     --line-weight: 2px;
  --motion: 160ms;        --row-height: 44px;
}
:root[data-theme="dense"] {
  --space-unit: 4px;      --radius: 4px;
  --type-scale: 1.12;     --line-weight: 1.5px;
  --motion: 100ms;        --row-height: 28px;
}
:root[data-density="compact"] { --space-unit: calc(var(--space-unit) * 0.75); }
```

Components reference only variables. The timeline reads `--row-height`, `--line-weight` and
`--point-radius` when computing geometry, so switching theme reflows the chart without touching its
code.

**Build order.** Calm is implemented first and completely; Bold and Dense are added afterwards as
token files (FR-9.2). A lint rule rejects hard-coded colours and pixel spacing in component styles,
because a single literal silently breaks one theme and nothing else would catch it.

---

## 6. Optimistic mutations and undo — FR-10.5 (DD-7)

Every mutation follows one pattern:

1. Cancel in-flight queries for the affected keys.
2. Snapshot the current cache.
3. Apply the change optimistically; the UI updates immediately.
4. On error, restore the snapshot and raise a toast offering retry.
5. On settle, invalidate the affected keys so the server reconciles.

Deletions are soft — `deleted_at` is set and the row is excluded from reads — so undo is a `PATCH`
clearing the column rather than a re-insert, and undo therefore restores the original id and all
child rows. Soft-deleted rows are purged after 30 days by a routine that runs on boot.

---

## 7. Testing — NFR-5 (DD-10)

Playwright specs run against a real server backed by a temporary SQLite file, seeded through the
API and torn down per spec, so tests are isolated and parallelisable.

| Spec | Covers |
| --- | --- |
| `tasks.spec.ts` | Create with title only; backdated creation; edit; complete; reopen; delete and undo | FR-1, 2, 4 |
| `updates.spec.ts` | Add update with default and edited date; edit; delete; ordering | FR-3 |
| `timeline.spec.ts` | Line spans creation→today; point per update at correct x; today marker; zoom; hover card; done tasks terminate | FR-5 |
| `pages.spec.ts` | Create, rename, delete with move and with delete; Overview grouping and filtering | FR-6 |
| `reorder.spec.ts` | Drag to reorder; persistence across reload; cross-page move; keyboard reorder | FR-7 |
| `theme.spec.ts` | Each theme applies; light/dark/system; density; persistence across reload | FR-9 |
| `friction.spec.ts` | `C` opens the composer from every view; task created in one keystroke plus title | FR-10 |

Vitest covers pure logic where a browser adds nothing: LexoRank key generation and rebalancing, the
date parser, and timeline scale maths.

---

## 8. Deferred capabilities

Recorded so the current design stays compatible with them.

**Location notifications (FR-8.3, DD-12).** Columns exist. Delivery needs a background trigger the
browser cannot provide; the likely shape is a phone automation calling a webhook, or a small
companion poller. Adding a `radius_m` column and a `geofences` table would suffice — no change to
existing tables.

**Tagging (DD-11).** Parked. If revived, `tags` and `task_tags` tables plus a rules table
(`pattern`, `tag_id`, `field`) and a job applying rules on write. Deterministic and explainable; no
external service.

**Authentication (DD-4).** `user_id` is already present throughout. Adding it means a session
mechanism, a login route, and resolving the user from the session instead of the fixed default —
no data migration.
