# Implementation Tracker — TaskTracker

**Last updated:** 2026-09-04
**Docs:** [`BRD.md`](./BRD.md) · [`DESIGN.md`](./DESIGN.md) · feature designs under `.docs/<feature>/design.md`

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` parked

Each milestone ends at a committable, working state. Requirement references point at `BRD.md`;
decision references (`DD-*`) at `DESIGN.md`.

---

## M0 — Foundations

- [x] Repo scaffold: `server/`, `web/`, `shared/`, `e2e/`, `deploy/`, `data/`
- [x] TypeScript strict config with project references across the three packages
- [x] `.gitignore` — `node_modules`, `dist`, `data/*.db*`, `data/backups`, `.env`
- [x] `.nvmrc` pinning Node 26 (DD-1)
- [x] Root `package.json` with workspaces and top-level scripts
- [x] `npm run dev` — API with reload plus Vite, proxying `/api` (NFR-1.3)
- [x] `npm run build` — web then server into `dist/`
- [x] Fastify server serving the static build with SPA fallback (DD-3)
- [x] SQLite connection, WAL mode, ordered migration runner on boot (DD-2)
- [x] Migration 001 — `users`, `page_members`, `pages`, `tasks`, `status_updates`,
      `status_events`, `settings`, with indexes (DD-4, DD-13, DD-15)
- [x] Seed the default user, a first page, and its membership row
- [x] Health endpoint `GET /api/health`

## M1 — Tasks, status & updates (FR-1, 2, 3, 4)

→ [`.docs/tasks/design.md`](./tasks/design.md)

**Backend**
- [x] Zod schemas in `shared/` for task, update, status event, page, settings (DD-9)
- [x] Repository layer — all SQL confined here, visibility join applied uniformly
- [x] Service layer — creation defaults, status transitions, soft delete
- [x] `GET/POST/PATCH/DELETE /api/tasks`, defaults applied server-side (FR-1.1, 2.1)
- [x] `PATCH /api/tasks/:id/status` writing a `status_events` row (FR-4.3, DD-15)
- [x] Creation writes the initial `todo` event dated `created_on`
- [x] `POST /api/tasks/:id/updates`, optionally carrying a status change (DD-16)
- [x] `PATCH`/`DELETE /api/updates/:id`, `PATCH /api/status-events/:id`
- [x] Soft delete with a 30-day purge on boot (FR-10.5)
- [x] Vitest — creation defaults, status transitions, date handling, soft delete

**Frontend**
- [x] App shell: sidebar, main region, responsive collapse
- [x] TanStack Query with the optimistic mutation pattern (DD-7)
- [x] `DateInput` — natural typed input, picker, arrow-key stepping (FR-10.6)
- [x] Task list with an inline composer at the foot (FR-10.2)
- [x] Status chip on the row — click to change (FR-4.1)
- [x] Task side sheet: title, description, dates, status history, updates, location, colour
- [x] Update composer with an optional status selector, `Enter` to submit (FR-3.4, DD-16)
- [x] Complete and reopen from the row (FR-4.4)
- [x] Undo toast on every destructive action (FR-10.5)
- [x] Global `C` shortcut opening the quick composer (FR-10.1)

## M2 — Pages & Overview (FR-6)

→ [`.docs/pages/design.md`](./pages/design.md)

- [x] `GET/POST/PATCH/DELETE /api/pages`, resolved through `page_members`
- [x] Deletion policy: `?tasks=move&to=` or `?tasks=delete`, `400` otherwise (FR-6.3)
- [x] Sidebar page list with inline create and rename
- [x] Page colour assignment and override
- [x] Overview aggregating every visible page (FR-6.4)
- [x] Overview grouping by page — collapsible, page-coloured headers (FR-6.5)
- [ ] Page filter in Overview (FR-6.6)
- [x] `hide_done` toggle across both views (FR-4.5)

## M3 — Ordering & sorting (FR-7)

→ [`.docs/pages/design.md`](./pages/design.md)

- [x] LexoRank key generation and rebalancing in `shared/` (DD-6)
- [x] Vitest — midpoint generation, boundaries, rebalance trigger
- [x] `PATCH /api/tasks/:id/position` taking neighbour ids, not an index
- [x] `PATCH /api/pages/:id/position`
- [x] New tasks append to the bottom (DD-18)
- [x] dnd-kit drag-to-reorder with optimistic list update (FR-7.1)
- [x] Touch drag verified on a real mobile browser (NFR-2.2)
- [x] Responsive layout at three widths; both panels collapse (NFR-2.3, DD-25)
- [x] Sidebar: swipe-to-close, scrim tap, safe-area insets, 44px targets
- [x] Task sheet becomes a bottom sheet with drag-to-dismiss on phones
- [x] Timeline name column is proportional and collapsible (DD-25)
- [x] Axis labels thin to the available width (DD-26)
- [x] Keyboard reordering
- [x] Page reordering by dragging in the sidebar (FR-6.2)
- [ ] Cross-page move by dragging a task onto a sidebar page
- [x] Sort modes: manual, created, status, title (FR-7.5, DD-17)
- [x] Drag disabled under non-manual sorts; manual order preserved

## M4 — Timeline (FR-5) — the centerpiece

→ [`.docs/timeline/design.md`](./timeline/design.md)

- [x] `GET /api/timeline` returning the whole view in one request (FR-5.9)
- [x] Range intersection so tasks spanning the viewport edge still render
- [x] Vitest — date→x scale, segment construction from events, clipping, tick intervals
- [x] SVG canvas: sticky name column, sticky date axis (DD-5)
- [x] Task lines from `created_on` to `completed_on` or today (FR-5.3)
- [x] **Segmented lines styled by status** — blocked dashed, in-progress solid (FR-5.3, DD-15)
- [x] Update points positioned by `occurred_on` (FR-5.4)
- [x] Per-task colour from the palette, overridable (FR-5.5)
- [x] Today marker (FR-5.8)
- [x] Hover and tap card with update text and date (FR-5.6)
- [x] Focusable points for keyboard access
- [x] Zoom across day / week / month / quarter, cursor-anchored (FR-5.7)
- [x] Pan by drag, scroll and arrow keys
- [x] Overlapping-point collapse with a count badge
- [x] Page grouping on the Overview timeline (FR-6.5)
- [x] Open-task arrow cap, done-task diamond cap

## M5 — Theming (FR-9)

→ [`.docs/theme/design.md`](./theme/design.md)

- [x] Token architecture — CSS custom properties on `<html>` (DD-8)
- [x] **Calm** theme, complete (FR-9.2)
- [x] Light / dark / system colour modes (FR-9.1)
- [x] Density comfortable / compact (FR-9.3)
- [x] `GET/PATCH /api/settings`, mirrored to `localStorage` to avoid a theme flash (FR-9.4)
- [x] Settings view with live theme preview
- [x] **Neon** theme — palette, typeface, ambient gradient, glow (DD-21, DD-22)
- [x] Theme and density separated: density owns all sizing (DD-21)
- [ ] Lint rule rejecting hard-coded colours and pixel spacing in components
- [x] Timeline geometry confirmed to read theme tokens
- [x] `prefers-reduced-motion` honoured

## M6 — Export & import (FR-11)

→ [`.docs/data/design.md`](./data/design.md)

- [x] `GET /api/export` — full dataset, children nested, `?download=1` (FR-11.1)
- [x] `?include_deleted=1` for a full-fidelity backup
- [x] `POST /api/import` — merge, replace, duplicate modes (FR-11.2)
- [x] Transactional import; validation before any write (FR-11.3)
- [x] Pre-import auto-backup to `data/backups/`
- [x] Export and import controls in Settings, with a pre-apply summary (FR-11.4)
- [x] Vitest — round-trip fidelity, each mode, malformed input writes nothing

## M7 — Location (FR-8, P1)

→ [`.docs/location/design.md`](./location/design.md)

- [x] Location fields on the task API
- [x] `places` table and API; migration 002 converts existing task locations (DD-23)
- [x] Place picker — type to filter, create on miss, "use where I am" (DD-24)
- [x] Places ordered by task count; coordinates indicator
- [x] Place chip on the row; `?place_id=` filtering (FR-8.2)
- [x] `GET /api/places/near` — the query the future suggestion panel needs
- [x] Notifications remain out of scope (DD-12)

## M8 — Testing (NFR-5)

- [x] Playwright config, plus a fixture booting a real server on a temp database
- [x] Per-spec seeding through the API, torn down after
- [x] `tasks.spec.ts` (FR-1, 2, 4)
- [x] `updates.spec.ts` (FR-3)
- [x] `status.spec.ts` (FR-4 — lifecycle, blocked, history dates)
- [x] `timeline.spec.ts` (FR-5 — including segmented status lines)
- [x] `pages.spec.ts` (FR-6)
- [x] `reorder.spec.ts` (FR-7 — drag, touch, sort modes)
- [x] `theme.spec.ts` (FR-9)
- [x] `data.spec.ts` (FR-11 — export and import from Settings)
- [ ] `friction.spec.ts` (FR-10)
- [x] `npm test` runs unit and e2e headless in one command (NFR-5.2)

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
- [-] "You are at X, these tasks match" panel — `/api/places/near` already answers it (DD-23)
- [-] Address search / geocoding — deliberately not built (DD-24)
- [-] Authentication and page-sharing UI — schema already supports it (DD-4, DD-13)
- [-] Roles on `page_members` — one-line migration when wanted (DD-13)
- [-] Conditional prioritisation by location, time or weekday (FR-7.6) — a sort mode (DD-17)
- [-] Auto-archiving completed tasks (OQ-1)
- [-] Task dependencies on the timeline (OQ-2)

---

## Progress

| Milestone | State |
| --- | --- |
| M0 Foundations | **Done** |
| M1 Tasks, status & updates | **Done** |
| M2 Pages & Overview | **Done** |
| M3 Ordering & sorting | **Done** |
| M4 Timeline | **Done** |
| M5 Theming | **Done** |
| M6 Export & import | **Done** |
| M7 Places | **Done**; arrival notifications parked |
| M8 Testing | **Done** |
| M9 Deployment | Not started |
