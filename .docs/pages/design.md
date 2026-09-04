# Feature Design — Pages, Overview & Ordering

**Status:** Approved
**Last updated:** 2026-09-04
**Requirements:** FR-6, FR-7 · **Parent:** [`../DESIGN.md`](../DESIGN.md)

---

## 1. Pages

A page is a container for tasks — a project or a context. It is also the unit of sharing; see
[`../sharing/design.md`](../sharing/design.md).

```
pages
├── id         PK
├── name       TEXT
├── colour     TEXT      auto-assigned, overridable
├── position   TEXT      LexoRank, sidebar order
└── created_at TIMESTAMP
```

Visibility comes from `page_members`, not from a column on the page.

### 1.1 API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/pages` | Pages the user is a member of, by `position` |
| `POST` | `/api/pages` | Create; `{ name, colour? }` |
| `PATCH` | `/api/pages/:id` | Rename, recolour |
| `PATCH` | `/api/pages/:id/position` | Reorder; `{ after_id }` or `{ before_id }` |
| `DELETE` | `/api/pages/:id` | Requires `?tasks=move&to=<id>` or `?tasks=delete` |

Deleting without the `tasks` parameter is a `400`. Tasks are never silently destroyed (FR-6.3).
With `tasks=delete` they are soft-deleted, so the whole operation remains undoable.

## 2. Overview — FR-6.4

A pinned view aggregating every task the user can see, across all pages.

Tasks are **grouped by their page** under a collapsible header carrying the page's colour (FR-6.5).
Grouping rather than a flat merged list is deliberate: a flat list loses the context that makes a
task meaningful, and the whole point of pages is that context. Grouping keeps cross-page visibility
without discarding it.

Each group shows its page name, colour, and a count of open tasks. Collapse state persists per
device. A page filter narrows the view to a subset (FR-6.6), and the same filter drives the
Overview timeline.

Ordering within a group is the page's own manual order, so a task sits in the same place in both
views.

## 3. Ordering — FR-7

### 3.1 LexoRank keys (DD-6)

`position` is a lexicographically sortable string. Placing a task between two neighbours means
generating a key strictly between theirs, so a reorder writes exactly one row:

```
before "a",  after "c"   → "b"
before "a",  after "b"   → "an"
before none, after "a"   → "Z"      (to the top)
before "z",  after none  → "za"     (to the bottom)
```

Integer positions would need every sibling renumbered on each drag — many writes and a race window.

Keys lengthen by roughly a character per repeated insertion at the same point. When any key in a
page exceeds 32 characters, a rebalance renumbers that page evenly. It is triggered lazily on write
and is expected to be rare.

### 3.2 Dragging

`dnd-kit` provides mouse, touch and keyboard dragging (NFR-2.2). On drop the list reorders
optimistically and `PATCH /api/tasks/:id/position` is sent with **neighbour ids, not an index**, so
a concurrent change elsewhere cannot silently misplace the task.

Dragging a task onto a page in the sidebar moves and positions it in one write, since the endpoint
also accepts a `page_id`.

Pages themselves reorder the same way.

### 3.3 Manual order is one sort among several

New tasks append to the **bottom** of their page: the list is worked top-down, so the oldest
incomplete task stays at the top and new work queues behind it.

Manual `position` is the default sort, not the only one. The list view offers alternatives — by
creation date, by status, alphabetical — described in
[`../tasks/design.md`](../tasks/design.md#42-sorting). Manual order is always retained in the
database, so switching sorts and back is lossless. Drag is disabled under a non-manual sort, since
dragging would have no persistent meaning.

This leaves room for **conditional prioritisation** later — ordering by proximity to a task's
location, by time of day, or by weekday — as a new sort mode plus a scoring function, with no change
to storage or list rendering.

## 4. Testing

| Case | Requirement |
| --- | --- |
| Create, rename, recolour a page | FR-6.2 |
| Reorder pages; order persists | FR-6.2 |
| Delete with `tasks=move` relocates them | FR-6.3 |
| Delete with `tasks=delete` soft-deletes them; undo restores | FR-6.3 |
| Delete without the parameter is rejected | FR-6.3 |
| Overview shows tasks from every page | FR-6.4 |
| Overview groups by page; groups collapse and persist | FR-6.5 |
| Page filter narrows list and timeline | FR-6.6 |
| Drag to reorder; order survives reload | FR-7.1, 7.2 |
| Touch drag on a mobile viewport | NFR-2.2 |
| Keyboard reorder | Accessibility |
| Drag onto a sidebar page moves and positions it | §3.2 |
| New tasks append to the bottom | §3.3 |
| Switching sort and back preserves manual order | §3.3 |

Unit tests cover key generation between neighbours, both boundaries, and the rebalance trigger.
