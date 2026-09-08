# Product & Architecture Design — Kram

**Status:** Approved
**Last updated:** 2026-09-04
**Companion documents:** [`BRD.md`](./BRD.md) · [`IMPLEMENTATION.md`](./IMPLEMENTATION.md)

**Feature designs:** [`tasks/`](./tasks/design.md) · [`pages/`](./pages/design.md) ·
[`timeline/`](./timeline/design.md) · [`theme/`](./theme/design.md) ·
[`sharing/`](./sharing/design.md) · [`location/`](./location/design.md) ·
[`data/`](./data/design.md)

---

## 1. Design philosophy

Three ideas drive every decision below.

**The timeline is the product.** A task list is a commodity; the reason this exists is to see
progress laid out against time. Where a trade-off appears between list ergonomics and timeline
quality, the timeline wins.

**Friction is the enemy.** A tracker that is tedious to update stops reflecting reality within a
week, at which point it is worse than useless because it is confidently wrong. Every interaction is
measured in keystrokes, and defaults are chosen so the common case needs none.

**Boring where it counts.** The novelty budget is spent on the timeline visualisation and the
theming system. Everything else — storage, transport, deployment — uses the most ordinary,
well-understood option available, so it can be operated years from now without relearning it.

## 2. Architecture at a glance

A single Node process serves both the JSON API and the built static frontend from one port. SQLite
holds the data in one file on disk. There is no separate database server, no cache layer, no message
queue, and no container runtime.

This is deliberate. The workload is one user, a few thousand rows, and a home network. Anything more
elaborate would be infrastructure to maintain rather than capability delivered.

### 2.1 Component diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (any device)                              │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                          React SPA (Vite build)                        │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │  │
│  │  │  Page View   │  │   Overview   │  │  Timeline    │  │  Settings  │  │  │
│  │  │              │  │     View     │  │    View      │  │            │  │  │
│  │  │ • task list  │  │ • all pages  │  │ • SVG canvas │  │ • themes   │  │  │
│  │  │ • dnd order  │  │ • grouped    │  │ • zoom / pan │  │ • density  │  │  │
│  │  │ • inline add │  │   by page    │  │ • hover card │  │ • pages    │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │  │
│  │         │                 │                 │                │         │  │
│  │         └────────┬────────┴─────────────────┴────────────────┘         │  │
│  │                  │                                                     │  │
│  │        ┌─────────▼──────────┐        ┌────────────────────────┐        │  │
│  │        │   Shared UI Kit    │        │    Theme Provider      │        │  │
│  │        │ Button · Field ·   │◄───────┤ CSS custom properties  │        │  │
│  │        │ Sheet · DateInput  │        │ Calm / Bold / Dense    │        │  │
│  │        │ Toast · Menu       │        │ light · dark · density │        │  │
│  │        └─────────┬──────────┘        └────────────────────────┘        │  │
│  │                  │                                                     │  │
│  │        ┌─────────▼───────────────────────────────────────────┐         │  │
│  │        │        Data Layer — TanStack Query                  │         │  │
│  │        │  • query cache, the single source of server truth   │         │  │
│  │        │  • optimistic mutations (NFR-3.1)                   │         │  │
│  │        │  • rollback + undo toast on failure                 │         │  │
│  │        └─────────┬───────────────────────────────────────────┘         │  │
│  └──────────────────┼─────────────────────────────────────────────────────┘  │
└─────────────────────┼────────────────────────────────────────────────────────┘
                      │  HTTP / JSON  (same origin, no CORS)
                      │  GET  /api/pages, /api/tasks, /api/timeline
                      │  POST /api/tasks, /api/tasks/:id/updates
                      │  PATCH/DELETE /api/tasks/:id …
┌─────────────────────▼────────────────────────────────────────────────────────┐
│                   NODE PROCESS  (systemd unit, Proxmox LXC)                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                          Fastify HTTP server                           │  │
│  │                                                                        │  │
│  │  ┌──────────────────────┐        ┌──────────────────────────────────┐  │  │
│  │  │   Static file serve  │        │          API routes              │  │  │
│  │  │  built SPA + assets  │        │  pages · tasks · updates ·       │  │  │
│  │  │  SPA fallback → /    │        │  status · reorder · timeline ·   │  │  │
│  │  │                      │        │  settings · export · import      │  │  │
│  │  └──────────────────────┘        └───────────────┬──────────────────┘  │  │
│  │                                                  │                     │  │
│  │                            ┌─────────────────────▼──────────────────┐  │  │
│  │                            │      Validation — Zod schemas          │  │  │
│  │                            │  shared with the frontend via /shared  │  │  │
│  │                            └─────────────────────┬──────────────────┘  │  │
│  │                                                  │                     │  │
│  │                            ┌─────────────────────▼──────────────────┐  │  │
│  │                            │        Service layer                   │  │  │
│  │                            │  business rules · ordering (LexoRank)  │  │  │
│  │                            │  page deletion policy · timeline shape │  │  │
│  │                            └─────────────────────┬──────────────────┘  │  │
│  │                                                  │                     │  │
│  │                            ┌─────────────────────▼──────────────────┐  │  │
│  │                            │      Repository layer (SQL)            │  │  │
│  │                            │  the only code that touches the DB     │  │  │
│  │                            └─────────────────────┬──────────────────┘  │  │
│  └──────────────────────────────────────────────────┼─────────────────────┘  │
│                                                     │                        │
│  ┌──────────────────────────────────────────────────▼─────────────────────┐  │
│  │                    better-sqlite3  (synchronous, in-process)           │  │
│  │                    + ordered migration runner on boot                  │  │
│  └──────────────────────────────────────────────────┬─────────────────────┘  │
└─────────────────────────────────────────────────────┼────────────────────────┘
                                                      │
                                          ┌───────────▼────────────┐
                                          │   data/app.db  │
                                          │   single SQLite file   │
                                          │   WAL mode             │
                                          │   Proxmox snapshots it │
                                          └────────────────────────┘
```

### 2.2 Request flow — adding a status update

The path below is the most common write in the system, and illustrates the optimistic pattern used
by every mutation.

```
User types "Added frontend with theme" and hits Enter
        │
        ▼
[TanStack Query] applies the update to the cache immediately
        │              → the point appears on the timeline at once (NFR-3.1)
        ▼
POST /api/tasks/:id/updates   { body, occurred_on }
        │
        ▼
[Zod] validates shape; occurred_on defaults to today when absent (FR-3.2)
        │
        ▼
[Service] confirms the task exists and belongs to the caller
        │
        ▼
[Repository] INSERT INTO status_updates …
        │
        ▼
201 + the created row
        │
        ├── success → cache reconciled with the server's row
        └── failure → cache rolled back, toast offers a retry (FR-10.5)
```

## 3. Data model

Two ideas shape it. **Visibility belongs to the page**, expressed through a membership table rather
than an owner column, so a page can later be shared with a second user without migrating anything.
**Assignment belongs to the task**, so within a shared page it is still clear whose work each item
is. Today both resolve to one user and neither surfaces in the UI.

```
┌──────────────┐
│    users     │  One row for now (DD-4).
│──────────────│
│ id      PK   │
│ name         │
└──┬────────┬──┘
   │ ∗      │ ∗ created_by / assigned_to
   │        └───────────────────────────────────────┐
┌──▼──────────────────┐                             │
│    page_members     │  Visibility lives here —    │
│─────────────────────│  a page has many members,   │
│ page_id  FK  ┐ PK   │  a user belongs to many     │
│ user_id  FK  ┘      │  pages. No role column yet  │
│ added_at            │  (DD-13).                   │
└──┬──────────────────┘                             │
   │ ∗                                              │
┌──▼───────────┐         ┌──────────────────────────┼──┐
│    pages     │         │        settings          │  │
│──────────────│         │──────────────────────────│  │
│ id      PK   │         │ user_id  FK → users      │  │
│ name         │         │ theme    calm|bold|dense │  │
│ colour       │         │ mode     light|dark|sys  │  │
│ position     │         │ density  comfy|compact   │  │
│ created_at   │         │ hide_done  bool          │  │
└──┬───────────┘         └──────────────────────────┘  │
   │ 1                                                 │
   │ ∗                                                 │
┌──▼─────────────────────────────┐                     │
│             tasks              │                     │
│────────────────────────────────│                     │
│ id           PK                │                     │
│ page_id      FK → pages        │  visibility         │
│ created_by   FK → users ───────┼─────────────────────┤  attribution
│ assigned_to  FK → users, null ─┼─────────────────────┘  whose task it is
│ title                          │
│ description  nullable          │
│ status       todo|in_progress| │  FR-4.1 — blocked is a first-class state
│              blocked|done      │
│ colour       auto-assigned     │  FR-5.5
│ position     LexoRank string   │  FR-7.2 — default sort, not the only one
│ created_on   DATE              │  FR-2 — editable, may be past
│ completed_on DATE nullable     │  FR-4.4
│ location_*   see location/     │  FR-8.1
│ created_at   TIMESTAMP         │  audit, distinct from created_on
│ updated_at   TIMESTAMP         │
│ deleted_at   TIMESTAMP nullable│  soft delete backs undo
└──┬──────────────────────┬──────┘
   │ 1                    │ 1
   │ ∗                    │ ∗
┌──▼─────────────────┐ ┌──▼──────────────────────┐
│  status_updates    │ │     status_events       │
│────────────────────│ │─────────────────────────│
│ id          PK     │ │ id           PK         │
│ task_id     FK     │ │ task_id      FK         │
│ body        TEXT   │ │ status       TEXT       │  the status being entered
│ occurred_on DATE   │ │ occurred_on  DATE       │  FR-4.3 — editable
│ created_by  FK     │ │ changed_by   FK → users │
│ created_at         │ │ created_at             │
│ deleted_at  null   │ └─────────────────────────┘
└────────────────────┘
   free-text notes        state history — drives the
   (FR-3.1)               timeline's segmented lines
```

**`created_on` versus `created_at`.** The first is the user's declared date for when the task began
and is freely editable, including into the past. The second is an immutable audit timestamp of when
the row was written. Conflating them would make backfilling impossible; the same split applies to
`occurred_on` on status updates and status events.

**Why two child tables.** A free-text note and a state change are different facts, and most notes
accompany no state change. Keeping them separate lets the timeline draw segments from
`status_events` and points from `status_updates` without either concept distorting the other. They
are still entered together — the update composer carries an optional status selector, so one
interaction writes both rows.

**Indexes.** `page_members(user_id, page_id)` for the visibility join;
`tasks(page_id, position)` for the ordered page read; `status_updates(task_id, occurred_on)` and
`status_events(task_id, occurred_on)` for timeline assembly; `tasks(page_id, created_on)` for the
timeline's range query.

## 4. Interface design

### 4.1 Layout

A persistent left sidebar lists pages, with Overview pinned at the top and Timeline directly beneath
it. The main region renders the selected view. On narrow screens the sidebar collapses behind a
menu button and the layout becomes single-column.

### 4.2 The timeline

Rendered as inline SVG rather than a charting library. The visual is specific enough — one line per
task, points at update dates, a today marker, zoomable calendar axis — that a general-purpose chart
library would be fought rather than used. SVG also keeps points as real DOM nodes, so hover, focus
and tap work without hit-testing a canvas, which matters for touch (NFR-2.2) and accessibility.

```
        Aug 12      Aug 19      Aug 26      Sep 2 ▼today
        │           │           │           │
Build   ●───────────●───────────●───────────────────────▶   (open, line continues)
app     ↑           ↑           ↑
        created     "Added      "Added frontend
                     backend"    with theme"

Garden  ●───────────────────────◆                            (done, line terminates)
        created                 completed

Taxes                   ●───────●                            (started later)
```

Each task's colour is assigned from an ordered palette on creation and is overridable. Line
thickness and point size come from the active theme's tokens, so Dense yields a compact chart and
Bold a dramatic one from the same geometry code.

Hovering or tapping a point raises a card with the update's text and date. Clicking a task's name
opens that task's detail.

### 4.3 Friction budget

FR-10 is enforced by these concrete rules:

| Action | Target cost |
| --- | --- |
| New task | `C` from anywhere, type title, `Enter` |
| New task on a specific page | Inline composer always present at the list's foot |
| Status update | Click the task, type, `Enter` |
| Change a date | Click it, type "yesterday" or pick |
| Reorder | Drag the row |
| Complete | Click the row's checkbox |
| Undo anything destructive | `Cmd/Ctrl+Z`, or the toast's Undo |

No modal dialog is used for routine work. Task detail opens as a side sheet, so the surrounding
context stays visible.

### 4.4 Theming

A theme is a set of CSS custom properties — colour, type scale, spacing unit, radius, border
weight, shadow, motion duration. Components consume only these variables and never hard-code a
value, so a new theme is a token file rather than a component change.

- **Calm** (default, built first) — restrained palette, generous whitespace, strong typographic
  hierarchy, minimal motion.
- **Bold** — saturated task colours, heavier weights, larger radii, pronounced motion.
- **Dense** — reduced spacing unit, smaller type, tighter rows, more visible at once.

Colour mode (light/dark/system) is orthogonal to theme, as is density (comfortable/compact).
Together they compose rather than multiply: three themes × two modes × two densities is one token
resolution function, not twelve stylesheets.

## 5. Design decisions

Each decision records what was chosen, why, and what it costs. These exist so that a future reader —
including the author — can tell a deliberate choice from an accident.

### DD-1 — No Docker; systemd inside the Proxmox LXC
**Decision.** Deploy as a plain Node process managed by systemd, inside an LXC.
**Why.** Proxmox's LXC already provides the container boundary. Running Docker inside it means
nested containers, a daemon, and an image build-and-push pipeline, in exchange for isolation that is
already present. For one small app this is cost with no return.
**Cost.** The Node version is host state rather than pinned in an image; `.nvmrc` and the deploy
runbook record it. Accepted.

### DD-2 — SQLite over Postgres
**Decision.** SQLite via `better-sqlite3`, in WAL mode, one file.
**Why.** One writer, a few thousand rows. SQLite removes a service to run, secure, back up and
upgrade. The database file falls inside Proxmox's existing LXC snapshots, so backup is already
solved. `better-sqlite3` is synchronous, which suits this workload and removes a class of async bugs.
**Cost.** Concurrent writers do not scale. Irrelevant at one user; the repository layer is the only
code touching SQL, so a port would be contained. JSON export (DD-14) provides an engine-independent
escape hatch if it is ever outgrown.

### DD-3 — Single process serves API and static assets
**Decision.** Fastify serves the built SPA and the JSON API on one port.
**Why.** One systemd unit, one port through the firewall, no CORS, no reverse-proxy rules for
splitting paths. Simplifies both deployment and local development.
**Cost.** Frontend and backend deploy together. For a single-author project that is a feature.

### DD-4 — Multi-user schema, no authentication yet
**Decision.** Visibility is modelled by a `page_members` join table from the first migration, and
tasks carry `created_by` and `assigned_to`. A fixed default user is resolved server-side. No login
screen.
**Why.** The user asked to build fast but keep the design scalable, and specifically to support
sharing a page between two people. An owner column on each row cannot express that — the page needs
many members. Carrying the join table now is nearly free; retrofitting it onto populated tables
later means migrating every row and rewriting every ownership check.
**Cost.** A join on every read, and a membership table with one row in it for now.

### DD-5 — SVG timeline, not a charting library
**Decision.** Hand-rolled inline SVG.
**Why.** The required visual is specific and no library renders it natively; adapting one costs more
than drawing it. SVG keeps update points as focusable DOM nodes, which serves touch and keyboard
access, and lets theme tokens drive geometry directly.
**Cost.** Axis ticks, zoom and pan are written by hand. Bounded, and the payoff is exact control.

### DD-6 — LexoRank-style string ordering
**Decision.** `position` is a lexicographically sortable string; reordering rewrites one row.
**Why.** Integer positions require renumbering siblings on every drag — many writes and a race
window. Fractional strings let an item be placed between two neighbours by generating a key between
theirs.
**Cost.** Keys lengthen after repeated insertions in one spot; a rebalance routine handles the rare
case.

### DD-7 — Optimistic UI with undo, not confirmation dialogs
**Decision.** Mutations apply to the cache immediately; destructive actions surface an undo toast
rather than a confirmation prompt.
**Why.** FR-10 makes friction a first-class requirement. Confirmation dialogs tax every action to
guard against a rare mistake; undo taxes none and still recovers. Optimism also makes the app feel
immediate over a VPN.
**Cost.** Rollback paths must be written per mutation, and each needs a test.

### DD-8 — Theme tokens as CSS custom properties
**Decision.** All visual values are CSS variables; a theme is a token set; components never
hard-code a value.
**Why.** FR-9 asks that a theme change how the view is *seen*, not just its colours. Tokenising
spacing, type scale and radius alongside colour means Dense and Bold are token files, not
alternative component trees. It also makes light/dark and density compose cleanly.
**Cost.** Discipline. A single hard-coded colour silently breaks one theme, so this is worth a
lint rule.

### DD-9 — Shared validation schemas
**Decision.** Zod schemas live in `shared/` and are imported by both server and client.
**Why.** One definition of what a task is, enforced at the boundary and reused for client-side form
validation and inferred TypeScript types. Removes the drift between client and server expectations.
**Cost.** Requires a shared build path; handled by TypeScript project references.

### DD-10 — Playwright as the primary test layer
**Decision.** End-to-end tests against a real browser and a real server with a temporary database
are the main safety net, with unit tests reserved for pure logic like ordering keys and date maths.
**Why.** The risky behaviour here is interactive — drag-to-reorder, timeline geometry, optimistic
rollback, date defaulting. Unit-testing a React tree tests the implementation; Playwright tests
what the user does. The user explicitly asked for protection against breaking changes.
**Cost.** Slower than unit tests. Mitigated by keeping the suite focused on FR primary paths.

### DD-11 — Tagging parked, and deterministic if revived
**Decision.** No tag inference. If it returns, a keyword and regex rules engine is preferred over an
LLM call.
**Why.** The user's own reasoning: determinism, and no behaviour drift as models are released. A
rules engine is also explainable — you can ask why a tag was applied — and needs no runtime service.
**Cost.** Rules require manual authorship. Not paid until the feature is actually wanted.

### DD-12 — Location stored, alerting deferred
**Decision.** Persist an optional label, latitude and longitude. Build no notification machinery.
**Why.** Browsers cannot reliably evaluate geofences in the background, and iOS is the strictest.
Shipping a notification feature that silently fails would be worse than not having one. Storing the
data now means it accumulates and is ready when a workable trigger exists.
**Cost.** The location field is inert for now, beyond display and filtering.

### DD-13 — Page membership without roles
**Decision.** `page_members` has `page_id` and `user_id` and no role column. Every member is equal.
**Why.** Roles are speculation until there is a second user with a reason to be restricted. The
table's existence is what makes sharing additive; the role column is a one-line migration with a
default whenever it is actually wanted.
**Cost.** No read-only sharing today. Nobody is sharing anything today.

### DD-14 — JSON export and import as a first-class feature
**Decision.** `GET /api/export` produces the whole dataset as readable JSON; `POST /api/import`
restores it in merge, replace or duplicate mode, transactionally.
**Why.** Three things at once: a backup independent of Proxmox, an engine-independent migration path
if SQLite is ever outgrown, and the assurance that the data is not trapped in a format only this app
understands. It also answers the main practical objection to SQLite — that nothing external can
connect to the database.
**Cost.** A format to version and keep in step with the schema. Mitigated by a round-trip test:
export, wipe, import, compare.

### DD-15 — Status as a field with dated history
**Decision.** Four statuses — `todo`, `in_progress`, `blocked`, `done` — with the current value
denormalised onto `tasks` and every transition recorded in `status_events` with an editable date.
**Why.** A boolean cannot express `blocked`, and blocked is exactly the state worth seeing: it is
not an absence of progress but a distinct condition, and *how long* something sat blocked is one of
the more useful things a timeline can show. Dated events let the timeline draw segmented lines
rather than a row of dots. Denormalising the current status keeps the common read free of an
aggregate.
**Cost.** Two sources of truth for status, kept in step by the service layer, plus a table that
grows with every transition. Both are cheap; the denormalised column is only ever written alongside
an event.

### DD-16 — Status events separate from status updates
**Decision.** Free-text notes (`status_updates`) and state transitions (`status_events`) are
different tables, entered through one interaction.
**Why.** They are different facts. Most notes accompany no state change, and a state change often
needs no note. Merging them would force one concept to carry the other's nullable columns and would
muddle the timeline, which draws segments from events and points from notes. Keeping the UI unified
— the update composer has a status selector — means the separation costs the user nothing.
**Cost.** Two writes for one interaction, inside one transaction.

### DD-17 — Manual order as the default sort, not the only one
**Decision.** `position` sorts by default; the list also offers creation date, status and title, and
manual order is always retained.
**Why.** The user wants conditional prioritisation later — by proximity to a task's location, time
of day, or weekday. Treating manual order as one sort among several means those arrive as a new sort
mode plus a scoring function, with no change to storage or list rendering. Retaining `position`
under other sorts makes switching lossless.
**Cost.** Drag must be disabled under non-manual sorts, since a drag would have nowhere to persist.

### DD-18 — New tasks append to the bottom
**Decision.** A new task takes the last position on its page.
**Why.** The list is worked top-down, so the oldest incomplete task should stay at the top and new
work queue behind it. An earlier draft put new tasks at the top for visibility; that inverts the
stated working order and was wrong.
**Cost.** A newly created task may be below the fold on a long page. The composer sits at the foot
of the list, so it is created in view.

### DD-21 — Theme is visual character; density owns size
**Decision.** Collapse the three "themes" (Calm / Bold / Dense) into two genuinely visual ones —
**Calm** and **Neon** — and let the existing density control own every size decision.
**Why.** The original three differed mainly in spacing, type scale and row height, which is exactly
what density already controls. Two knobs were doing one job, and neither changed how the app looked;
the user's summary was that the themes "just change size, nothing else". Separating the axes gives
each one a real job: density answers *how much fits on screen*, theme answers *what it feels like*.
**Cost.** One fewer preset, and the `theme` column's accepted values change. Handled by a migration
that maps `bold` and `dense` onto `calm`, since neither carried visual identity worth preserving.

### DD-22 — Luminance over glassmorphism
**Decision.** The Neon theme gets its character from saturated colour, gradient depth and glow —
not from heavy backdrop blur. Blur is used only where a surface genuinely floats over content (the
task sheet's scrim, dropdown menus), never on scrolling surfaces or the timeline.
**Why.** The user asked for vibrancy that invites use, explicitly not "heavy UI operation".
`backdrop-filter` forces the compositor to re-rasterise on every scroll and drag frame, which would
cost most exactly where the app must stay smooth — timeline panning and drag-to-reorder. Colour and
glow are free by comparison, and carry the same energy.
**Cost.** Not the literal frosted-glass aesthetic. In exchange, the timeline keeps its frame budget.

### DD-23 — Places as first-class records
**Decision.** Promote location from three nullable columns on `tasks` to a `places` table (name,
lat, lng, radius), with tasks referencing a place. Places are chosen from a type-to-filter list, or
created from the device's current position.
**Why.** The useful question is "what can I do while I am at the office" — and "the office" is a
place you return to, not an address you look up each time. Named, reusable places answer that
directly; per-task free-text coordinates do not, because two tasks at the same place would carry
unrelated strings. It also makes the planned "you are at X, here is what matches" panel a query over
places rather than a redesign, and gives arrival notifications a radius to trigger on.
**Cost.** A table and a migration, plus a join on task reads. The old `location_label` is preserved
as a fallback for tasks whose location is a note rather than a place.

### DD-24 — No geocoding service
**Decision.** No address search. Places are named by the user and located from the device.
**Why.** Geocoding means calling an external service (Nominatim or similar) from a home server,
which adds a network dependency, sends the user's search text off the machine, and needs rate-limit
handling — for a lookup that is only needed once per place, and only when that place is somewhere
the user is not. Saving the current position while standing there is both simpler and more accurate.
**Cost.** A place the user has never visited must have its coordinates entered by hand, or be saved
on first arrival. Rare, and the name alone is enough until then.

### DD-20 — `node:sqlite` rather than `better-sqlite3`
**Decision.** Use Node's built-in `node:sqlite` module through a thin adapter
(`server/src/db/sqlite.ts`) exposing the small surface the app needs.
**Why.** `better-sqlite3` is a native addon: it has no prebuilt binary for Node 26 and fails to
compile against the current V8 API, so installing it needs a C++ toolchain, Python and node-gyp.
That directly contradicts NFR-1 — deployment on the Proxmox LXC should be `npm ci` and nothing
else. `node:sqlite` ships with the runtime, so there is no build step, no compiler on the LXC, and
no native module to rebuild after a Node upgrade. It is the same SQLite underneath.
**Cost.** `node:sqlite` has no `.transaction()` helper and rejects `undefined` bindings, so the
adapter supplies both (savepoints for nesting, plus binding normalisation). Roughly 100 lines, and
it confines the difference to one file — swapping back later would be a change to that file alone.

### DD-25 — Layout adapts at three widths, and both panels collapse
**Decision.** Below 760px the sidebar becomes an overlay drawer (tap-scrim or swipe to close) and
the task sheet becomes a bottom sheet with drag-to-dismiss. The timeline's name column is a share of
the canvas rather than a fixed width, and can be collapsed away entirely.
**Why.** The app is used from a phone as much as a laptop (NFR-2). A fixed 210px name column took
more than half a phone screen and left the chart an unusable sliver, and a side sheet on a 412px
viewport is just a full-screen modal that happens to slide from the wrong edge. A bottom sheet is
reachable with a thumb and keeps the list visible above it.
**Cost.** Three layout regimes to keep working rather than one. The Playwright suite runs a mobile
project against the real breakpoints, which is what makes that maintainable.

### DD-26 — Axis labels thin themselves to the available width
**Decision.** `ticksFor` takes the plot width and blanks the labels that cannot fit, keeping their
gridlines and always preferring major ticks.
**Why.** Tick density was chosen per zoom level alone, which is correct on a laptop and illegible on
a phone — week labels overlapped into unreadable mush. Density has to be a function of both the
level and the space available.
**Cost.** The axis shows fewer labels on a narrow screen. Gridlines stay, so position is still
readable, and major ticks survive so month and year boundaries remain visible.

**Revision (2026-09-05).** The first implementation kept every major tick unconditionally and
strided the rest by index, which still let a month boundary land beside an already-kept label —
"31 Aug" and "7 Sep" overlapped by 18px on a phone. Thinning now works in pixel positions: major
ticks are placed first, minor ones fill the gaps, and both passes honour the same minimum spacing.
Stating the rule in the units the collision happens in is what makes it hold at every width.

### DD-29 — Service hardening is bounded by what an unprivileged LXC permits
**Decision.** The systemd unit uses `NoNewPrivileges`, an empty
`CapabilityBoundingSet`, `RestrictSUIDSGID`, `RestrictRealtime`, `LockPersonality`,
`RestrictNamespaces` and `SystemCallArchitectures`. It does **not** use `ProtectSystem`,
`PrivateTmp`, `PrivateDevices`, `ProtectHome`, the `ProtectKernel*` family, or
`RestrictAddressFamilies`.
**Why.** Those directives are implemented with a mount namespace, and setting one up requires
remounting `/proc` — which an unprivileged LXC is not permitted to do. Present, they do not harden
the service; they stop it existing, with `status=226/NAMESPACE` and a restart loop. The first real
deploy failed exactly this way. The remaining directives need no namespace and still close
privilege escalation, setuid abuse and the capability surface.
The unit is asserted by `server/src/unit.test.ts`, because this shipped broken twice: the offending
directives are valid systemd that works on bare metal, so neither a syntax check nor running the
binary locally finds them. Only a test that encodes the deployment target does.

`RestrictAddressFamilies` belongs on that list for a different reason, and it cost a second failed
deploy to find. It reads as though it constrains only the sockets the app opens, but enumerating
network interfaces goes through `AF_NETLINK` — and Fastify enumerates interfaces on `listen`, to log
the bound address. Blocking it makes `uv_interface_addresses` fail with `EAFNOSUPPORT` (errno 97)
*after* the port is bound, so the app worked and the process still exited 1. `HOST` in
`/etc/kram.env` is the control that actually constrains the listener.

**Cost.** No filesystem confinement below the container. Acceptable because the LXC *is* the
isolation boundary (DD-1) — duplicating it inside the guest bought nothing and broke the unit. A
consequence worth stating: with no capabilities the service cannot bind a port below 1024.

### DD-28 — Persisted identifiers are never named after the product
**Decision.** The SQLite file is `app.db`, the export discriminator is
`task-timeline.export.v1`, and the browser storage key is `app.settings`. None carries the product
name. Values written under earlier names are accepted on read and adopted in place.
**Why.** Renaming TaskTracker to Kram would otherwise have silently orphaned the existing database
(the server would have created an empty one beside it), invalidated every export already taken, and
reset the stored theme. A rename is a cosmetic decision; it must not be a data-migration event. The
things that outlive the name should not be named after it.
**Cost.** Two legacy lists to carry (`LEGACY_EXPORT_FORMATS`, and the adoption loop in
`server/src/index.ts`). Both are a few lines and are the reason a future rename costs nothing.

### DD-27 — The timeline earns attention through hierarchy and motion
**Decision.** Status drives visual weight rather than colour alone: `in_progress` renders at full
opacity with a themed glow, `done` and `todo` recede. Rows are zebra-striped, today is a labelled
pill rather than a bare dashed line, and the chart draws itself in once on mount — rows staggered
top to bottom, lines growing left to right from their start date.
**Why.** Every element competed at equal weight, so the view read as a static diagram rather than
something worth opening. Live work is the reason to look at a timeline, so it is the only status
that gets full weight. The draw-in is left-to-right because that is the axis the data is measured
on — the motion says something true rather than decorating.
**Cost.** Animation on a view that must stay smooth while panning. It runs only on mount, never on
range changes, and uses `transform` and `opacity` exclusively so it stays on the compositor.
`prefers-reduced-motion` removes it entirely rather than shortening it.

### DD-19 — One design document per feature
**Decision.** `.docs/<feature>/design.md`, one folder per feature, rather than a single combined
document.
**Why.** Each feature's design is read while working on that feature. A combined document is
navigated rather than read, and grows into the thing nobody updates.
**Cost.** Cross-references between documents. Preferable to one that is silently stale.

## 6. Technology summary

| Layer | Choice | Rationale |
| --- | --- | --- |
| Runtime | Node 26 LTS | Already on the host; `.nvmrc` pins it |
| Language | TypeScript, strict | Shared types across the boundary |
| Server | Fastify | Fast, small, first-class TypeScript |
| Database | SQLite + better-sqlite3 | DD-2 |
| Migrations | Hand-rolled ordered SQL runner | No ORM needed at this size |
| Portability | JSON export / import | DD-14 |
| Validation | Zod | DD-9 |
| Frontend | React 19 + Vite | Fast builds, ordinary tooling |
| Server state | TanStack Query | Optimistic mutations, cache as truth |
| Drag & drop | dnd-kit | Touch support, accessible, actively maintained |
| Styling | CSS Modules + custom properties | DD-8; no runtime cost |
| Timeline | Hand-written SVG | DD-5 |
| Testing | Playwright, plus Vitest for pure logic | DD-10 |
| Process | systemd | DD-1 |

## 7. Repository layout

```
Kram/
├── .docs/
│   ├── BRD.md               requirements
│   ├── DESIGN.md            this document
│   ├── IMPLEMENTATION.md    milestone tracker
│   ├── tasks/design.md      tasks, status, updates
│   ├── pages/design.md      pages, overview, ordering
│   ├── timeline/design.md   the timeline view
│   ├── theme/design.md      theming and tokens
│   ├── sharing/design.md    users, membership, assignment
│   ├── location/design.md   location storage
│   └── data/design.md       storage, export, import
├── server/
│   ├── src/
│   │   ├── index.ts         entry, static serving, listen
│   │   ├── routes/          HTTP layer
│   │   ├── services/        business rules
│   │   ├── repositories/    all SQL
│   │   └── db/              connection + migrations
│   └── migrations/
├── web/
│   └── src/
│       ├── views/           Page, Overview, Timeline, Settings
│       ├── components/      shared UI kit
│       ├── theme/           token definitions
│       └── api/             query hooks
├── shared/                  Zod schemas + inferred types
├── e2e/                     Playwright specs
├── deploy/                  systemd unit + deploy runbook
└── data/                    SQLite file (gitignored)
```

## 8. Deployment

**Local development.** `npm run dev` starts the API with reload and the Vite dev server, the latter
proxying `/api` to the former, so the browser sees one origin exactly as in production.

**Production, on the Proxmox LXC.**

```bash
git pull
npm ci
npm run build          # builds web/ then server/ into dist/
sudo systemctl restart kram
```

The systemd unit runs `node dist/server/index.js` with `Restart=always`, an env file for
configuration, and `WorkingDirectory` set so the SQLite file resolves to `data/`. Migrations run on
boot, before the server accepts connections, so a deploy that changes the schema needs no separate
step.

### DD-30 — The app asks systemd to update; it never updates itself
**Decision.** `GET /api/updates` reads git state and `POST /api/updates/apply` runs
`systemctl start --no-block kram-update.service`. The pull, build and restart live in
`kram-update.service`, a root-owned oneshot. A polkit rule lets the `kram` user start that one unit,
with that one verb, and nothing else.
**Why.** The update has to run as root — it writes a systemd unit and restarts a service — but the
app must not. Putting the logic behind an endpoint in a process that runs as `kram` with an empty
capability set means the reachable surface is "install what is already on the remote", not "execute
arbitrary code as root". The privileged half stays in a file root owns and the app cannot edit.
**Cost.** Three deployment artefacts instead of none, and a feature that silently does nothing on a
container without polkit — so `can_apply` is reported to the UI rather than assumed.

### DD-31 — Header and fetch-metadata checks on the apply endpoint, not a token
**Decision.** `POST /api/updates/apply` requires `X-Kram-Request: 1` and rejects a request whose
`Sec-Fetch-Site` is anything other than `same-origin` or `none`.
**Why.** There is no authentication yet (DD-4), and the owner accepted an ungated endpoint on a LAN.
That still leaves CSRF: any page open in a browser on the network can POST here, and a form submits
without ever reading the response. A cross-site form cannot set a custom header — attempting it
forces a preflight this server never approves — so the header alone closes the drive-by case.
**Cost.** Not authentication, and not claimed to be: a deliberate request from the LAN still works,
which is the access that was chosen. It is replaced by a real check when auth lands.

### DD-32 — The task row is a grid with named tracks, not a flex row
**Decision.** `TaskRow` uses `display: grid` with named columns, every child placed explicitly by
name, and a separate `grid-template-columns` per breakpoint. `.meta` is `display: contents` so its
children join the row grid directly.
**Why.** Under flex, each item was positioned by the width of everything before it, so the date and
status columns landed at a different x on every row — 1232, 1249 and 1271 across three consecutive
rows. Nothing failed; the list simply could not be scanned down. Named tracks put every row's
columns in the same place whether or not that row carries a place or a page.
**Cost.** Each breakpoint must declare its own template. Hiding a child with `display: none` leaves
its track in place, which wrapped every row onto a second line and doubled the row height — so the
templates and the visibility rules have to be kept in step. `e2e/layout.spec.ts` asserts a single
grid line at six widths for exactly this reason.

### DD-33 — Touch targets are grown with pseudo-elements, not by resizing the control
**Decision.** Small controls keep their drawn size and gain a transparent `::after` with a negative
inset that extends the hit area to 44px.
**Why.** The completion checkbox is the most-tapped control in the app and was a 17px target, well
under half the 44px both Apple and Google specify. Enlarging the circle would have coarsened a
deliberately dense list; extending the hit box costs nothing visually.
**Cost.** The reach is invisible in a screenshot and in any assertion on the element's box, so the
test measures the pseudo-element's inset instead.

### DD-34 — The update check reads the remote without writing to the repository
**Decision.** `checkForUpdates` uses `git ls-remote`, never `git fetch`. Applying an update still
fetches, but that happens in `update.sh` under `kram-update.service`, which runs as root.
**Why.** `/opt/kram` is root-owned while the service runs as `kram` (DD-30) — chowning the checkout
to the service user is what made git refuse with "detected dubious ownership" and silently break
updating altogether. A fetch writes remote-tracking refs and `.git/FETCH_HEAD`, so it failed in
production with `cannot open '.git/FETCH_HEAD': Permission denied` and could never have worked under
that ownership. `ls-remote` asks the remote what it has and touches nothing locally, which is all a
read-only check needs.
**Cost.** The new commits are not in the local object store, so `git log current..latest` usually
cannot produce subjects. The result carries `behind_by: 0` in that case and the UI says "An update
is available" rather than a count — an empty commit list must never be read as "up to date", so the
service tracks whether git could answer at all, separately from what it answered.


### DD-35 — Navigation state lives in the URL, without a router library
**Decision.** The current view and the open task are held in the address bar: `/`, `/timeline`,
`/settings`, `/p/:pageId`, with an open task as `?task=:taskId`. `parseRoute`/`routeToPath` in
`web/src/routing.ts` are the whole mapping; `useRoute` binds them to `history.pushState` and
`popstate`.
**Why.** `view` was `useState`, so a refresh always landed on Overview — reported as "refreshing on
Settings sends you home", but it applied to every page and to any open task, and nothing in the app
was linkable. The server already answered unknown non-API paths with `index.html`, so no server
change was needed. A router library was not: `ViewKey` is a four-case discriminated union, and
adopting one would mean a second copy of the routes to keep in step with it.
**Why the task is a query parameter, not a path.** The sheet is an overlay on a list, not a view of
its own. `/p/abc?task=xyz` keeps the page in the URL, so closing the sheet returns to the list it
was opened from; `/t/xyz` would drop that context and force a guess.
**Cost.** Two hand-written functions to keep in step with `ViewKey` — covered by a round-trip test
over every reachable state. Changing view deliberately closes an open task, since carrying it across
would show a task belonging to another page.

### DD-36 — A checklist is part of a task, not a second kind of thing
**Decision.** `checklist_items` hangs off `tasks`. There is no separate to-do entity.
**Why.** "Buy groceries" and "get the car serviced" are already tasks: they have a page, a status,
a timeline and an update stream. What they lack is the parts. A parallel list entity would duplicate
all of that and force every feature to be written twice.
**Why the timestamps live on the item.** `added_on` and `checked_on` answer "what did I buy, and
when" directly. Deriving them from an event log would make unchecking a compensating entry rather
than `checked_on = NULL`, and "what is still outstanding" a fold over history rather than a `WHERE`.
**Why one summary update per day.** Ticking eight groceries must not put eight lines in the
timeline. Checklist activity writes ONE `status_updates` row per task per day, tagged with
`checklist_day` and enforced by a partial unique index on `(task_id, checklist_day)`; updates a
person typed carry NULL and are untouched. The summary is recomputed from the items on every change
rather than incremented — an incrementing counter would drift the moment an item was unticked,
renamed or deleted. An item added and ticked the same day is reported once, as checked.
**Why the task does not auto-complete.** A standing list (the weekly shop) empties and refills; a
one-off list (a car service) is finished once. Completing the task when the last item is ticked
would archive the weekly shop every week, so the row shows progress instead, and `reset` clears the
ticks while keeping the items and their past summaries.
**Cost.** A new table the transfer layer has to know about — omitting it made export/import silent
data loss, caught by a round-trip test. `checklist_day` also had to be declared in the export schema,
because zod strips unknown keys and was dropping the column the SQL had selected.

### DD-37 — Optimistic cache patches must be synchronous for controlled inputs
**Decision.** `onMutate` for a checklist toggle patches the query cache **before** awaiting
anything; `cancelQueries` is fired afterwards without awaiting.
**Why.** The checkbox renders `checked` from query state. Awaiting `cancelQueries` first deferred
the patch past the paint, so React repainted the box to its old value for a frame before the
optimistic value landed — a visible flicker, and enough to make Playwright's `.check()` retry
(it clicks, re-reads the old value, and clicks again, toggling it back).
**Cost.** The `.check()`/`.uncheck()` helpers are still wrong for a controlled input, because the
DOM lags the cache by one commit regardless; the tests use `.click()` and assert on the rendered
count, which is what a person actually reads.

### DD-38 — Permission is checked with pkcheck, and polkit is installed rather than assumed
**Decision.** `canApply()` asks polkit via `pkcheck`, not `systemctl start --dry-run`; both
deploy scripts install polkit when it is absent and then verify the grant is in effect.
**Why.** `--dry-run` validates the unit and plans the transaction — it does not run the polkit
check, so it returns success for a user polkit will refuse. In production the dry-run passed, the
button appeared, and pressing it returned `Access denied`. Separately, both scripts guarded the
rule on `/etc/polkit-1/rules.d` already existing, which on a fresh Debian container it does not, so
the rule was never installed and the skip was silent.
**Why it survived review.** `canApply` had no tests at all, and on any developer machine it returns
false for unrelated reasons, so nothing distinguished a correct implementation from this one. The
guard against "a button that appears and then fails" was itself a check that could not fail — the
third instance of that pattern in this project.
**Cost.** `pkcheck` must be spawned with the subject process resolved *inside* `runuser`; passing
the outer `$$` checks root and passes regardless. The tests inspect the source of `canApply`, which
is blunt, but the alternative is a polkit-enabled container in CI.
