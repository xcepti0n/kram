# Business Requirements Document — TaskTracker

**Status:** Approved
**Last updated:** 2026-09-04
**Owner:** vaiibhav

---

## 1. Purpose

A personal task tracker whose distinguishing feature is a **timeline view**: every task is a
horizontal line across a calendar axis, annotated with the status updates recorded against it.
The goal is to answer, at a glance, *"what have I been working on, and how has each thing
progressed?"* — a question that flat task lists answer badly.

Tasks are grouped into **pages** (contexts / projects), with an overall view that aggregates
across all pages.

## 2. Scope

Single user for now, running on a home network, reached over VPN when away. The data model is
designed multi-user from day one so that adding accounts later is additive rather than a rewrite.

### Out of scope (explicitly parked)

| Item | Rationale |
| --- | --- |
| Automatic tag inference (orig. req. #11) | Parked until a real need appears. If revived, a deterministic rules engine is preferred over an LLM, to avoid non-determinism and behaviour drift across model releases. |
| Location-based notifications (part of orig. req. #8) | Location is *stored* now; alerting is deferred. Browsers cannot reliably run background geofences, especially on iOS. |
| Collaboration, sharing, comments | Single-user product. |
| Native mobile apps | Responsive web app covers Windows / macOS / iOS / Android from one codebase. |

## 3. Users

One user (the owner), across desktop and mobile browsers. No login screen initially. All records
carry an owner reference so that authentication can be introduced without migrating data.

## 4. Functional requirements

Each requirement traces back to the originating request number in parentheses.

### FR-1 — Task creation (req. 1, 10)
- FR-1.1 Create a task with, at minimum, a title. No other field is mandatory.
- FR-1.2 Creation must be reachable from anywhere via a keyboard shortcut and a persistent
  affordance; it must not require navigating to a separate screen.
- FR-1.3 A task may optionally have a description, a page, a colour, and a location.

### FR-2 — Creation date (req. 2)
- FR-2.1 Every task has a creation date, defaulting to today.
- FR-2.2 The creation date is editable at creation time and afterwards, including to past dates,
  so history can be backfilled.
- FR-2.3 Future creation dates are permitted (planned work).

### FR-3 — Status updates (req. 3)
- FR-3.1 A task holds an ordered series of status updates, each free text
  (e.g. *"Added frontend with theme"*).
- FR-3.2 Each update has its own date, defaulting to today, editable to any past or future date.
- FR-3.3 Updates can be edited and deleted after the fact.
- FR-3.4 Adding an update must be possible without leaving the current view.

### FR-4 — Completion state (req. 3, refined)
- FR-4.1 A task is either open or done, independent of its update stream.
- FR-4.2 Completing a task records the completion date, which terminates its timeline line.
- FR-4.3 Completed tasks can be hidden or shown in every view.

### FR-5 — Timeline view (req. 4)
- FR-5.1 One row per task; task names form the vertical axis.
- FR-5.2 The horizontal axis is **calendar time**, running left to right.
- FR-5.3 Each task renders as a continuous line from its creation date to its completion date, or
  to today if still open.
- FR-5.4 Each status update renders as a point on that line, positioned at the update's date.
- FR-5.5 Each task has its own distinct colour, assigned automatically and overridable.
- FR-5.6 Hovering or tapping a point reveals that update's text and date.
- FR-5.7 The axis is zoomable between day, week, month and quarter scales, and pans horizontally.
- FR-5.8 A marker indicates today.
- FR-5.9 The timeline can show one page's tasks or all pages at once.

### FR-6 — Pages (req. 6)
- FR-6.1 Tasks belong to exactly one page.
- FR-6.2 Pages are user-created, renameable, reorderable and deletable.
- FR-6.3 Deleting a page requires choosing whether to move or delete its tasks; tasks are never
  silently destroyed.
- FR-6.4 An **Overview** page aggregates tasks from all pages.
- FR-6.5 In Overview, tasks are grouped by their page, with each group collapsible and carrying its
  page's colour, so cross-page context is visible without losing per-page separation.
- FR-6.6 Overview supports filtering to a subset of pages.

### FR-7 — Ordering (req. 7)
- FR-7.1 Within a page, tasks are manually reorderable by dragging.
- FR-7.2 Order persists across sessions and devices.
- FR-7.3 Order is a property of the task within its page; the intent is "top ones first".
- FR-7.4 Drag-and-drop must work by touch as well as mouse.

### FR-8 — Location (req. 8, P1)
- FR-8.1 A task may optionally carry a location: a label, plus latitude and longitude.
- FR-8.2 Location is displayed on the task and is filterable.
- FR-8.3 Notification on arrival is out of scope for now; the schema anticipates it (see
  `.docs/feature/design.md`, Deferred Capabilities).

### FR-9 — Theming (req. 9, P1)
- FR-9.1 Light, dark and system-following colour modes.
- FR-9.2 Selectable **view themes** that change layout character, not merely colour:
  - **Calm** (default) — restrained palette, generous whitespace, strong typography.
  - **Bold** — saturated colours, heavier type, pronounced motion; timeline as centerpiece.
  - **Dense** — compact rows, smaller type, maximum information per screen.
- FR-9.3 A density control (comfortable / compact) applying across all views.
- FR-9.4 Theme choice persists per device.

### FR-10 — Low friction (req. 10)
This is a cross-cutting requirement, not a feature. It constrains every other requirement:
- FR-10.1 Creating a task is at most one keystroke away from any view.
- FR-10.2 Adding a status update takes at most two interactions from seeing the task.
- FR-10.3 All edits save automatically; there are no explicit save buttons for field edits.
- FR-10.4 Editing happens in place wherever possible, rather than in modal forms.
- FR-10.5 Destructive actions are undoable rather than confirmation-gated.
- FR-10.6 Dates accept natural typed input ("yesterday", "3 Aug") as well as a picker.

## 5. Non-functional requirements

### NFR-1 — Deployment (Proxmox)
- NFR-1.1 Runs as a plain Node process under systemd inside a Proxmox LXC. No Docker — the LXC is
  already the container boundary; nesting adds a daemon and an image pipeline for no benefit.
- NFR-1.2 Deployment is `git pull && npm ci && npm run build && systemctl restart tasktracker`.
- NFR-1.3 One command starts a full dev environment locally.
- NFR-1.4 The database is a single file, backed up by Proxmox's existing LXC snapshots.

### NFR-2 — Platforms
- NFR-2.1 Responsive across desktop and mobile browsers; current Chrome, Safari, Firefox and Edge.
- NFR-2.2 Touch-capable throughout, including drag-to-reorder and timeline pan/zoom.

### NFR-3 — Performance
- NFR-3.1 Interactions feel immediate: mutations apply optimistically in the UI.
- NFR-3.2 The timeline stays smooth at 200 tasks with 20 updates each.
- NFR-3.3 Cold start to interactive under 2 seconds on the home network.

### NFR-4 — Data integrity
- NFR-4.1 No task or update is lost without an explicit, undoable user action.
- NFR-4.2 Schema changes are applied by versioned, ordered migrations.

### NFR-5 — Testing
- NFR-5.1 Playwright end-to-end tests cover each functional requirement's primary path, guarding
  against regressions.
- NFR-5.2 The suite runs headless in one command.

### NFR-6 — Security
- NFR-6.1 Home network plus VPN is the security boundary for now.
- NFR-6.2 No secrets in the repository; configuration via environment variables.
- NFR-6.3 Every table carrying user data has an owner column from the first migration, so
  authentication can be added without a data migration.

## 6. Success criteria

1. A task can be created in under three seconds from any view.
2. The timeline makes a month of activity across all pages legible in one screen.
3. Backfilling a task that started three weeks ago, with its intervening updates, is straightforward.
4. Deploying an update to Proxmox is a single command with no manual steps.
5. The Playwright suite catches a regression in any FR before it is deployed.

## 7. Open questions

| # | Question | Status |
| --- | --- | --- |
| OQ-1 | Should completed tasks eventually auto-archive off the timeline after some period? | Deferred until real usage shows clutter. |
| OQ-2 | Does the timeline need a dependency or blocking relationship between tasks? | Not requested; revisit if scheduling needs emerge. |
| OQ-3 | Will location ever need a radius for geofencing, or is a point sufficient? | Point for now; radius column can be added when notifications are built. |
