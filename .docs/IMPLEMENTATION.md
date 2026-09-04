# Implementation Tracker — TaskTracker

**Last updated:** 2026-09-04
**Docs:** [`BRD.md`](./BRD.md) · [`DESIGN.md`](./DESIGN.md) · feature designs under `.docs/<feature>/design.md`

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` parked

Each milestone ends at a committable, working state. Requirement references point at `BRD.md`;
decision references (`DD-*`) at `DESIGN.md`.

---

## M0 — Foundations

- [ ] Repo scaffold: `server/`, `web/`, `shared/`, `e2e/`, `deploy/`, `data/`
- [ ] TypeScript strict config with project references across the three packages
- [ ] `.gitignore` — `node_modules`, `dist`, `data/*.db*`, `data/backups`, `.env`
- [ ] `.nvmrc` pinning Node 26 (DD-1)
- [ ] Root `package.json` with workspaces and top-level scripts
- [ ] `npm run dev` — API with reload plus Vite, proxying `/api` (NFR-1.3)
- [ ] `npm run build` — web then server into `dist/`
- [ ] Fastify server serving the static build with SPA fallback (DD-3)
- [ ] SQLite connection, WAL mode, ordered migration runner on boot (DD-2)
- [ ] Migration 001 — `users`, `page_members`, `pages`, `tasks`, `status_updates`,
      `status_events`, `settings`, with indexes (DD-4, DD-13, DD-15)
- [ ] Seed the default user, a first page, and its membership row
- [ ] Health endpoint `GET /api/health`

## M1 — Tasks, status & updates (FR-1, 2, 3, 4)

→ [`.docs/tasks/design.md`](./tasks/design.md)

**Backend**
- [ ] Zod schemas in `shared/` for task, update, status event, page, settings (DD-9)
- [ ] Repository layer — all SQL confined here, visibility join applied uniformly
- [ ] Service layer — creation defaults, status transitions, soft delete
- [ ] `GET/POST/PATCH/DELETE /api/tasks`, defaults applied server-side (FR-1.1, 2.1)
- [ ] `PATCH /api/tasks/:id/status` writing a `status_events` row (FR-4.3, DD-15)
- [ ] Creation writes the initial `todo` event dated `created_on`
- [ ] `POST /api/tasks/:id/updates`, optionally carrying a status change (DD-16)
- [ ] `PATCH`/`DELETE /api/updates/:id`, `PATCH /api/status-events/:id`
- [ ] Soft delete with a 30-day purge on boot (FR-10.5)
- [ ] Vitest — creation defaults, status transitions, date handling, soft delete

**Frontend**
- [ ] App shell: sidebar, main region, responsive collapse
- [ ] TanStack Query with the optimistic mutation pattern (DD-7)
- [ ] `DateInput` — natural typed input, picker, arrow-key stepping (FR-10.6)
- [ ] Task list with an inline composer at the foot (FR-10.2)
- [ ] Status chip on the row — click to change (FR-4.1)
- [ ] Task side sheet: title, description, dates, status history, updates, location, colour
- [ ] Update composer with an optional status selector, `Enter` to submit (FR-3.4, DD-16)
- [ ] Complete and reopen from the row (FR-4.4)
- [ ] Undo toast on every destructive action (FR-10.5)
- [ ] Global `C` shortcut opening the quick composer (FR-10.1)

## M2 — Pages & Overview (FR-6)

→ [`.docs/pages/design.md`](./pages/design.md)

- [ ] `GET/POST/PATCH/DELETE /api/pages`, resolved through `page_members`
- [ ] Deletion policy: `?tasks=move&to=` or `?tasks=delete`, `400` otherwise (FR-6.3)
- [ ] Sidebar page list with inline create and rename
- [ ] Page colour assignment and override
- [ ] Overview aggregating every visible page (FR-6.4)
- [ ] Overview grouping by page — collapsible, page-coloured headers (FR-6.5)
- [ ] Page filter in Overview (FR-6.6)
- [ ] `hide_done` toggle across both views (FR-4.5)

## M3 — Ordering & sorting (FR-7)

→ [`.docs/pages/design.md`](./pages/design.md)

- [ ] LexoRank key generation and rebalancing in `shared/` (DD-6)
- [ ] Vitest — midpoint generation, boundaries, rebalance trigger
- [ ] `PATCH /api/tasks/:id/position` taking neighbour ids, not an index
- [ ] `PATCH /api/pages/:id/position`
- [ ] New tasks append to the bottom (DD-18)
- [ ] dnd-kit drag-to-reorder with optimistic list update (FR-7.1)
- [ ] Touch drag verified on a real mobile browser (NFR-2.2)
- [ ] Keyboard reordering
- [ ] Cross-page move by dragging onto a sidebar page
- [ ] Sort modes: manual, created, status, title (FR-7.5, DD-17)
- [ ] Drag disabled under non-manual sorts; manual order preserved

## M4 — Timeline (FR-5) — the centerpiece

→ [`.docs/timeline/design.md`](./timeline/design.md)

- [ ] `GET /api/timeline` returning the whole view in one request (FR-5.9)
- [ ] Range intersection so tasks spanning the viewport edge still render
- [ ] Vitest — date→x scale, segment construction from events, clipping, tick intervals
- [ ] SVG canvas: sticky name column, sticky date axis (DD-5)
- [ ] Task lines from `created_on` to `completed_on` or today (FR-5.3)
- [ ] **Segmented lines styled by status** — blocked dashed, in-progress solid (FR-5.3, DD-15)
- [ ] Update points positioned by `occurred_on` (FR-5.4)
- [ ] Per-task colour from the palette, overridable (FR-5.5)
- [ ] Today marker (FR-5.8)
- [ ] Hover and tap card with update text and date (FR-5.6)
- [ ] Focusable points for keyboard access
- [ ] Zoom across day / week / month / quarter, cursor-anchored (FR-5.7)
- [ ] Pan by drag, scroll and arrow keys
- [ ] Overlapping-point collapse with a count badge
- [ ] Page grouping on the Overview timeline (FR-6.5)
- [ ] Open-task arrow cap, done-task diamond cap

## M5 — Theming (FR-9)

→ [`.docs/theme/design.md`](./theme/design.md)

- [ ] Token architecture — CSS custom properties on `<html>` (DD-8)
- [ ] **Calm** theme, complete (FR-9.2)
- [ ] Light / dark / system colour modes (FR-9.1)
- [ ] Density comfortable / compact (FR-9.3)
- [ ] `GET/PATCH /api/settings`, mirrored to `localStorage` to avoid a theme flash (FR-9.4)
- [ ] Settings view with live theme preview
- [ ] **Bold** theme as a token set
- [ ] **Dense** theme as a token set
- [ ] Lint rule rejecting hard-coded colours and pixel spacing in components
- [ ] Timeline geometry confirmed to read theme tokens
- [ ] `prefers-reduced-motion` honoured

## M6 — Export & import (FR-11)

→ [`.docs/data/design.md`](./data/design.md)

- [ ] `GET /api/export` — full dataset, children nested, `?download=1` (FR-11.1)
- [ ] `?include_deleted=1` for a full-fidelity backup
- [ ] `POST /api/import` — merge, replace, duplicate modes (FR-11.2)
- [ ] Transactional import; validation before any write (FR-11.3)
- [ ] Pre-import auto-backup to `data/backups/`
- [ ] Export and import controls in Settings, with a pre-apply summary (FR-11.4)
- [ ] Vitest — round-trip fidelity, each mode, malformed input writes nothing

## M7 — Location (FR-8, P1)

→ [`.docs/location/design.md`](./location/design.md)

- [ ] Location fields on the task API
- [ ] Location editor in the side sheet — label plus coordinates
- [ ] "Use my current location" via the geolocation API
- [ ] Label autocomplete from previously used places
- [ ] Location chip on the row, and filtering (FR-8.2)
- [ ] Notifications remain out of scope (DD-12)

## M8 — Testing (NFR-5)

- [ ] Playwright config, plus a fixture booting a real server on a temp database
- [ ] Per-spec seeding through the API, torn down after
- [ ] `tasks.spec.ts` (FR-1, 2, 4)
- [ ] `updates.spec.ts` (FR-3)
- [ ] `status.spec.ts` (FR-4 — lifecycle, blocked, history dates)
- [ ] `timeline.spec.ts` (FR-5 — including segmented status lines)
- [ ] `pages.spec.ts` (FR-6)
- [ ] `reorder.spec.ts` (FR-7 — drag, touch, sort modes)
- [ ] `theme.spec.ts` (FR-9)
- [ ] `data.spec.ts` (FR-11 — export and import from Settings)
- [ ] `friction.spec.ts` (FR-10)
- [ ] `npm test` runs unit and e2e headless in one command (NFR-5.2)

## M9 — Deployment (NFR-1)

- [ ] `deploy/tasktracker.service` — systemd unit, `Restart=always`, env file (DD-1)
- [ ] `deploy/README.md` — LXC runbook: Node install, first deploy, backup, restore
- [ ] Env configuration: `PORT`, `DATA_DIR`, `NODE_ENV`
- [ ] Production build verified from a clean checkout
- [ ] Migrations confirmed to run before the server accepts connections
- [ ] Deploy verified end-to-end on the Proxmox LXC

## Parked

- [-] Tag inference (orig. req. 11) — deterministic rules engine if revived (DD-11)
- [-] Location arrival notifications (FR-8.3) — needs a background trigger (DD-12)
- [-] Authentication and page-sharing UI — schema already supports it (DD-4, DD-13)
- [-] Roles on `page_members` — one-line migration when wanted (DD-13)
- [-] Conditional prioritisation by location, time or weekday (FR-7.6) — a sort mode (DD-17)
- [-] Auto-archiving completed tasks (OQ-1)
- [-] Task dependencies on the timeline (OQ-2)

---

## Progress

| Milestone | State |
| --- | --- |
| M0 Foundations | Not started |
| M1 Tasks, status & updates | Not started |
| M2 Pages & Overview | Not started |
| M3 Ordering & sorting | Not started |
| M4 Timeline | Not started |
| M5 Theming | Not started |
| M6 Export & import | Not started |
| M7 Location | Not started |
| M8 Testing | Not started |
| M9 Deployment | Not started |
