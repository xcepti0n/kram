# CLAUDE.md — TaskTracker

Personal task tracker whose centerpiece is a **timeline view**: each task is a horizontal line on a
calendar axis, with a point for every status update.

## Documentation

Read these before making changes. Keep them current as the code evolves.

| Document | Contents |
| --- | --- |
| `.docs/BRD.md` | Requirements, numbered `FR-*` / `NFR-*` |
| `.docs/DESIGN.md` | Architecture, component diagram, data model, decisions `DD-1`…`DD-24` |
| `.docs/IMPLEMENTATION.md` | Milestone tracker — **update as work completes** |

Per-feature designs live in `.docs/<feature>/design.md` (DD-19):

| Feature | Covers |
| --- | --- |
| `.docs/tasks/` | Task fields, status model, status updates, sorting |
| `.docs/pages/` | Pages, Overview grouping, LexoRank ordering |
| `.docs/timeline/` | Scale, segmented lines, points, zoom and pan |
| `.docs/theme/` | Token system, the three themes, persistence |
| `.docs/sharing/` | Users, page membership, assignment |
| `.docs/location/` | Places, the picker; arrival notifications deferred |
| `.docs/data/` | SQLite rationale, JSON export and import, migrations |

## Status

Design complete; implementation not started. Next up is M0 (Foundations) in the tracker.

## Stack

Node 26 · TypeScript strict · Fastify · SQLite (built-in `node:sqlite`, DD-20) · React 19 + Vite ·
TanStack Query · dnd-kit · CSS Modules · Playwright + Vitest.

One Node process serves the API and the built SPA on a single port. No Docker — it runs under
systemd in a Proxmox LXC (DD-1).

## Layout

```
server/    Fastify API — routes → services → repositories (all SQL confined to repositories)
web/       React SPA — views, components, theme tokens, api hooks
shared/    Zod schemas and inferred types, imported by both sides
e2e/       Playwright specs
deploy/    systemd unit and the LXC runbook
data/      SQLite file (gitignored)
```

## Commands

```bash
npm run dev     # API with reload + Vite proxying /api
npm run build   # web then server into dist/
npm test        # Vitest + Playwright, headless
npm start       # production server from dist/
```

## Conventions

- **Layering.** Routes validate and delegate; services hold business rules; repositories hold every
  line of SQL. Do not query the database from a route.
- **Database access.** Through `server/src/db/sqlite.ts`, which adapts `node:sqlite` to the small
  surface the app uses. No native addon, so `npm ci` needs no compiler (DD-20).
- **Validation.** Zod schemas live in `shared/` and are used by both sides. Types are inferred from
  them, never hand-written alongside.
- **Dates.** `created_on`, `completed_on`, `occurred_on` are calendar dates (`YYYY-MM-DD`, no
  timezone) and are user-editable. `created_at` / `updated_at` are UTC audit timestamps, never
  shown. Do not conflate the two — backfilling depends on the split.
- **Visibility.** Access resolves through `page_members`, applied in the repository layer and
  nowhere else. Never write an ad-hoc ownership predicate in a route or service (DD-4, DD-13).
- **Status.** Four states: `todo`, `in_progress`, `blocked`, `done`. `tasks.status` holds the
  current value; every transition also writes a dated `status_events` row. Both are written
  together in the service layer, never independently (DD-15).
- **Ownership vs. assignment.** `page_members` says who can see a page; `tasks.assigned_to` says
  whose task it is; `tasks.created_by` records who wrote it down. Three different questions.
- **Theming.** Components read CSS custom properties only; a hard-coded colour or spacing breaks a
  theme silently (DD-8). Two axes, kept separate: **theme** (calm/neon) owns palette, typeface and
  depth; **density** owns every size (DD-21). Never put a measurement in a theme block. Derive
  geometry as `base * factor` — a self-referential `calc(var(--x) * n)` silently unsets the token.
- **Places.** Location is a `places` record referenced by `place_id`, not free text per task, so
  "what can I do here" is answerable (DD-23). No geocoding: places are named by the user and located
  from the device (DD-24).
- **Mutations.** Optimistic, with cache rollback on failure. Destructive actions are soft deletes
  with an undo toast, never a confirmation dialog (DD-7).
- **Ordering.** `position` is a LexoRank-style string. Reordering sends neighbour ids, not an
  index, and writes one row (DD-6). New tasks append to the **bottom** (DD-18). Manual order is the
  default sort, not the only one, and is retained under other sorts (DD-17).
- **Friction.** FR-10 is a hard constraint. A new interaction that adds a step to task creation or
  status updates needs a reason recorded in the design doc.

## Working agreements

- Commit as work completes, at each committable state.
- Update `.docs/IMPLEMENTATION.md` in the same commit as the work it tracks.
- Record notable technical choices as a new `DD-*` entry in `.docs/DESIGN.md`.
- Add or extend a Playwright spec when changing behaviour covered by one.
- Never add Claude as a commit co-author.

## Parked

Tag inference (a deterministic rules engine is preferred over an LLM if it is ever revived),
location arrival notifications, authentication and the page-sharing UI, roles on `page_members`, and
conditional prioritisation by location or time. The schema already accommodates all of them — see
the Parked section of `.docs/IMPLEMENTATION.md`.
