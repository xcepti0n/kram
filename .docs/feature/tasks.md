# Implementation Tracker — TaskTracker

**Last updated:** 2026-09-04
**Docs:** [`../BRD.md`](../BRD.md) · [`../DESIGN.md`](../DESIGN.md) · [`design.md`](./design.md)

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` parked

Each milestone ends at a committable, working state. Requirement references point at `BRD.md`.

---

## M0 — Foundations

- [ ] Repo scaffold: `server/`, `web/`, `shared/`, `e2e/`, `deploy/`, `data/`
- [ ] TypeScript strict config with project references across the three packages
- [ ] `.gitignore` — `node_modules`, `dist`, `data/*.db*`, `.env`
- [ ] `.nvmrc` pinning Node 26 (DD-1)
- [ ] Root `package.json` with workspaces and the top-level scripts
- [ ] `npm run dev` — API with reload plus Vite, proxying `/api` (NFR-1.3)
- [ ] `npm run build` — web then server into `dist/`
- [ ] Fastify server serving static build with SPA fallback (DD-3)
- [ ] SQLite connection, WAL mode, ordered migration runner on boot (DD-2)
- [ ] Migration 001 — `users`, `pages`, `tasks`, `status_updates`, `settings` with indexes
- [ ] Seed the default user and a first page on an empty database (DD-4)
- [ ] Health endpoint `GET /api/health`

## M1 — Tasks and status updates (FR-1, 2, 3, 4)

**Backend**
- [ ] Zod schemas in `shared/` for task, update, page, settings (DD-9)
- [ ] Repository layer — all SQL confined here
- [ ] Service layer — creation defaults, completion, soft delete
- [ ] `GET/POST/PATCH/DELETE /api/tasks` with server-side defaults (FR-1.1, 2.1)
- [ ] `POST /api/tasks/:id/complete` and `/reopen` (FR-4)
- [ ] `POST /api/tasks/:id/updates`, `PATCH`/`DELETE /api/updates/:id` (FR-3)
- [ ] Soft-delete with 30-day purge on boot (FR-10.5)
- [ ] Vitest — creation defaults, date handling, soft delete

**Frontend**
- [ ] App shell: sidebar, main region, responsive collapse
- [ ] TanStack Query setup with the optimistic mutation pattern (DD-7)
- [ ] `DateInput` — natural typed input, picker, arrow-key stepping (FR-10.6)
- [ ] Task list with inline composer at the foot (FR-10.2)
- [ ] Task side sheet: title, description, dates, updates, location, colour
- [ ] Add-update composer inside the sheet, `Enter` to submit (FR-3.4)
- [ ] Complete / reopen from the list row (FR-4.1)
- [ ] Undo toast for every destructive action (FR-10.5)
- [ ] Global `C` shortcut opening the quick composer (FR-10.1)

## M2 — Pages (FR-6)

- [ ] `GET/POST/PATCH/DELETE /api/pages`
- [ ] Deletion policy: `?tasks=move&to=` or `?tasks=delete`, `400` otherwise (FR-6.3)
- [ ] Sidebar page list with inline create and rename
- [ ] Page colour assignment and override
- [ ] Overview view aggregating all pages (FR-6.4)
- [ ] Overview grouping by page, collapsible, page-coloured headers (FR-6.5)
- [ ] Page filter in Overview (FR-6.6)
- [ ] `hide_done` toggle wired through both views (FR-4.3)

## M3 — Ordering (FR-7)

- [ ] LexoRank key generation and rebalancing in `shared/` (DD-6)
- [ ] Vitest — midpoint generation, boundaries, rebalance trigger
- [ ] `PATCH /api/tasks/:id/position` taking neighbour ids, not an index
- [ ] `PATCH /api/pages/:id/position`
- [ ] dnd-kit drag-to-reorder with optimistic list update (FR-7.1)
- [ ] Touch drag verified on a real mobile browser (NFR-2.2)
- [ ] Keyboard reordering for accessibility
- [ ] Cross-page move by dragging onto a sidebar page

## M4 — Timeline (FR-5) — the centerpiece

- [ ] `GET /api/timeline` returning the whole view in one request (FR-5.9)
- [ ] Range intersection so tasks spanning the viewport edge still render
- [ ] Vitest — date→x scale, range clipping, tick intervals
- [ ] SVG canvas: sticky name column, sticky date axis (DD-5)
- [ ] Task lines from `created_on` to `completed_on` or today (FR-5.3)
- [ ] Update points positioned by `occurred_on` (FR-5.4)
- [ ] Per-task colour from the palette, overridable (FR-5.5)
- [ ] Today marker (FR-5.8)
- [ ] Hover and tap card showing update text and date (FR-5.6)
- [ ] Focusable points for keyboard access
- [ ] Zoom across day / week / month / quarter, cursor-anchored (FR-5.7)
- [ ] Pan by drag, scroll and arrow keys
- [ ] Overlapping-point collapse with a count badge
- [ ] Page grouping on the Overview timeline (FR-6.5)
- [ ] Open-task arrow cap and done-task diamond cap

## M5 — Theming (FR-9)

- [ ] Token architecture — CSS custom properties on `<html>` (DD-8)
- [ ] **Calm** theme, complete (FR-9.2)
- [ ] Light / dark / system colour modes (FR-9.1)
- [ ] Density comfortable / compact (FR-9.3)
- [ ] `GET/PATCH /api/settings`, mirrored to `localStorage` to avoid a theme flash (FR-9.4)
- [ ] Settings view
- [ ] **Bold** theme as a token set
- [ ] **Dense** theme as a token set
- [ ] Lint rule rejecting hard-coded colours and pixel spacing in components
- [ ] Timeline geometry confirmed to read theme tokens

## M6 — Location (FR-8, P1)

- [ ] Location fields on the task API
- [ ] Location editor in the side sheet — label plus coordinates
- [ ] "Use my current location" via the browser geolocation API
- [ ] Location display on the task row and filtering (FR-8.2)
- [ ] Notifications remain out of scope (DD-12)

## M7 — Testing (NFR-5)

- [ ] Playwright config, plus a fixture booting a real server on a temp database
- [ ] Per-spec seeding through the API, torn down after
- [ ] `tasks.spec.ts` (FR-1, 2, 4)
- [ ] `updates.spec.ts` (FR-3)
- [ ] `timeline.spec.ts` (FR-5)
- [ ] `pages.spec.ts` (FR-6)
- [ ] `reorder.spec.ts` (FR-7)
- [ ] `theme.spec.ts` (FR-9)
- [ ] `friction.spec.ts` (FR-10)
- [ ] `npm test` runs unit and e2e headless in one command (NFR-5.2)

## M8 — Deployment (NFR-1)

- [ ] `deploy/tasktracker.service` — systemd unit, `Restart=always`, env file (DD-1)
- [ ] `deploy/README.md` — LXC runbook: Node install, first deploy, backup, restore
- [ ] Env configuration: `PORT`, `DATA_DIR`, `NODE_ENV`
- [ ] Production build verified from a clean checkout
- [ ] Migrations confirmed to run before the server accepts connections
- [ ] Deploy verified end-to-end on the Proxmox LXC

## Parked

- [-] Tag inference (orig. req. 11) — deterministic rules engine if revived (DD-11)
- [-] Location arrival notifications (FR-8.3) — needs a background trigger (DD-12)
- [-] Authentication — schema already carries `user_id` (DD-4)
- [-] Auto-archiving completed tasks (OQ-1)
- [-] Task dependencies on the timeline (OQ-2)

---

## Progress

| Milestone | State |
| --- | --- |
| M0 Foundations | Not started |
| M1 Tasks & updates | Not started |
| M2 Pages | Not started |
| M3 Ordering | Not started |
| M4 Timeline | Not started |
| M5 Theming | Not started |
| M6 Location | Not started |
| M7 Testing | Not started |
| M8 Deployment | Not started |
