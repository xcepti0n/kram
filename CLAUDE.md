# CLAUDE.md — TaskTracker

Personal task tracker whose centerpiece is a **timeline view**: each task is a horizontal line on a
calendar axis, with a point for every status update.

## Documentation

Read these before making changes. Keep them current as the code evolves.

| Document | Contents |
| --- | --- |
| `.docs/BRD.md` | Requirements, numbered `FR-*` / `NFR-*` |
| `.docs/DESIGN.md` | Architecture, component diagram, design decisions `DD-1`…`DD-12` |
| `.docs/feature/design.md` | API surface, ordering, timeline geometry, theme tokens |
| `.docs/feature/tasks.md` | Implementation tracker — **update as work completes** |

## Status

Design complete; implementation not started. Next up is M0 (Foundations) in the tracker.

## Stack

Node 26 · TypeScript strict · Fastify · SQLite (`better-sqlite3`) · React 19 + Vite ·
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
- **Validation.** Zod schemas live in `shared/` and are used by both sides. Types are inferred from
  them, never hand-written alongside.
- **Dates.** `created_on`, `completed_on`, `occurred_on` are calendar dates (`YYYY-MM-DD`, no
  timezone) and are user-editable. `created_at` / `updated_at` are UTC audit timestamps, never
  shown. Do not conflate the two — backfilling depends on the split.
- **Theming.** Components read CSS custom properties only. A hard-coded colour or pixel spacing
  breaks a theme silently; a lint rule enforces this (DD-8).
- **Mutations.** Optimistic, with cache rollback on failure. Destructive actions are soft deletes
  with an undo toast, never a confirmation dialog (DD-7).
- **Ordering.** `position` is a LexoRank-style string. Reordering sends neighbour ids, not an
  index, and writes one row (DD-6).
- **Friction.** FR-10 is a hard constraint. A new interaction that adds a step to task creation or
  status updates needs a reason recorded in the design doc.

## Working agreements

- Commit as work completes, at each committable state.
- Update `.docs/feature/tasks.md` in the same commit as the work it tracks.
- Record notable technical choices as a new `DD-*` entry in `.docs/DESIGN.md`.
- Add or extend a Playwright spec when changing behaviour covered by one.
- Never add Claude as a commit co-author.

## Parked

Tag inference (deterministic rules engine preferred over an LLM if revived), location arrival
notifications, and authentication. The schema already carries `user_id` throughout so auth is
additive. See the Parked section of the tracker.
