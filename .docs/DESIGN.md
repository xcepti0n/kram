# Product & Architecture Design — TaskTracker

**Status:** Approved
**Last updated:** 2026-09-04
**Companion documents:** [`BRD.md`](./BRD.md) · [`feature/design.md`](./feature/design.md) · [`feature/tasks.md`](./feature/tasks.md)

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
│  │  │  SPA fallback → /    │        │  reorder · timeline · settings   │  │  │
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
                                          │   data/tasktracker.db  │
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

```
        ┌────────────────┐
        │     users      │   One row for now. Exists so that multi-user is
        │────────────────│   additive later rather than a migration (NFR-6.3).
        │ id       PK    │
        │ name           │
        │ created_at     │
        └───────┬────────┘
                │ 1
                │
                │ ∗
        ┌───────▼────────┐         ┌──────────────────────────┐
        │     pages      │         │        settings          │
        │────────────────│         │──────────────────────────│
        │ id       PK    │         │ user_id  FK → users      │
        │ user_id  FK    │         │ theme      calm|bold|dense│
        │ name           │         │ mode       light|dark|sys │
        │ colour         │         │ density    comfy|compact  │
        │ position       │         │ hide_done  bool           │
        │ created_at     │         └──────────────────────────┘
        └───────┬────────┘
                │ 1
                │
                │ ∗
        ┌───────▼──────────────────────┐
        │            tasks             │
        │──────────────────────────────│
        │ id           PK              │
        │ user_id      FK → users      │
        │ page_id      FK → pages      │
        │ title                        │
        │ description  nullable        │
        │ colour       auto-assigned   │  FR-5.5
        │ position     LexoRank string │  FR-7.2
        │ created_on   DATE            │  FR-2 — editable, may be past
        │ completed_on DATE nullable   │  FR-4.2 — null means open
        │ location_label    nullable   │  FR-8.1
        │ location_lat      nullable   │
        │ location_lng      nullable   │
        │ created_at   TIMESTAMP       │  audit, distinct from created_on
        │ updated_at   TIMESTAMP       │
        └───────┬──────────────────────┘
                │ 1
                │
                │ ∗
        ┌───────▼──────────────────────┐
        │       status_updates         │
        │──────────────────────────────│
        │ id           PK              │
        │ task_id      FK → tasks      │
        │ body         TEXT            │  FR-3.1 — free text
        │ occurred_on  DATE            │  FR-3.2 — editable, defaults today
        │ created_at   TIMESTAMP       │
        └──────────────────────────────┘
```

**`created_on` versus `created_at`.** The first is the user's declared date for when the task began
and is freely editable, including into the past. The second is an immutable audit timestamp of when
the row was written. Conflating them would make backfilling impossible; the same split applies to
`occurred_on` on status updates.

**Indexes.** `tasks(user_id, page_id, position)` serves the ordered page list;
`status_updates(task_id, occurred_on)` serves timeline assembly; `tasks(user_id, created_on)` serves
the timeline's date-range query.

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
code touching SQL, so a port would be contained.

### DD-3 — Single process serves API and static assets
**Decision.** Fastify serves the built SPA and the JSON API on one port.
**Why.** One systemd unit, one port through the firewall, no CORS, no reverse-proxy rules for
splitting paths. Simplifies both deployment and local development.
**Cost.** Frontend and backend deploy together. For a single-author project that is a feature.

### DD-4 — Multi-user schema, no authentication yet
**Decision.** Every user-owned table carries `user_id` from the first migration; a fixed default
user is resolved server-side. No login screen.
**Why.** The user asked to build fast but keep the design scalable. Carrying the column is nearly
free now; retrofitting ownership onto populated tables later is not. Deferring the login UI keeps
friction at zero.
**Cost.** A currently meaningless column on every table, and an unused foreign key.

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

## 6. Technology summary

| Layer | Choice | Rationale |
| --- | --- | --- |
| Runtime | Node 26 LTS | Already on the host; `.nvmrc` pins it |
| Language | TypeScript, strict | Shared types across the boundary |
| Server | Fastify | Fast, small, first-class TypeScript |
| Database | SQLite + better-sqlite3 | DD-2 |
| Migrations | Hand-rolled ordered SQL runner | No ORM needed at this size |
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
TaskTracker/
├── .docs/
│   ├── BRD.md               requirements
│   ├── DESIGN.md            this document
│   └── feature/
│       ├── design.md        per-feature technical design
│       └── tasks.md         implementation tracker
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
sudo systemctl restart tasktracker
```

The systemd unit runs `node dist/server/index.js` with `Restart=always`, an env file for
configuration, and `WorkingDirectory` set so the SQLite file resolves to `data/`. Migrations run on
boot, before the server accepts connections, so a deploy that changes the schema needs no separate
step.
