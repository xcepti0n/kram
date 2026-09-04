# Feature Design — Tasks & Status Updates

**Status:** Approved
**Last updated:** 2026-09-04
**Requirements:** FR-1, FR-2, FR-3, FR-4 · **Parent:** [`../DESIGN.md`](../DESIGN.md)

---

## 1. The task

A task is a title, a date it began, a lifecycle status, and a stream of free-text updates. Only the
title is required (FR-1.1); everything else has a server-side default so the client can create a
task by posting a bare title.

```
tasks
├── id            PK
├── page_id       FK → pages          the task belongs to the page (see ../sharing/design.md)
├── created_by    FK → users          who added it — attribution
├── assigned_to   FK → users, null    whose task it is; defaults to created_by
├── title         TEXT                required, 1–500 chars
├── description   TEXT, null
├── status        TEXT                todo | in_progress | blocked | done
├── colour        TEXT                auto-assigned from the palette, overridable
├── position      TEXT                LexoRank key, manual order (see ../pages/design.md)
├── created_on    DATE                user-declared start; editable, may be past or future
├── completed_on  DATE, null          set when status becomes done
├── location_*    see ../location/design.md
├── created_at    TIMESTAMP           audit, immutable
├── updated_at    TIMESTAMP           audit
└── deleted_at    TIMESTAMP, null     soft delete
```

### 1.1 Two kinds of date

`created_on` is the user's declared date for when the task began. It is freely editable, including
into the past, which is what makes backfilling possible (FR-2.2). `created_at` is an immutable audit
timestamp recording when the row was written.

Conflating these would defeat FR-2. The same split applies to `occurred_on` on status updates and on
status events.

## 2. Status — FR-4

Four states, chosen because they are the smallest set that captures the distinction the user
actually needs:

| Status | Meaning | On the timeline |
| --- | --- | --- |
| `todo` | Not started | Line drawn, muted |
| `in_progress` | Being worked on | Line drawn, full colour |
| `blocked` | Waiting on something external | Line drawn dashed, desaturated |
| `done` | Finished | Line terminates with a diamond cap |

`blocked` is the reason this is a field rather than a boolean. A blocked stretch is not an absence of
progress — it is a distinct, visible state, and seeing *how long* something sat blocked is one of
the more useful things the timeline can show.

### 2.1 Status history

Status changes are recorded as events, not just a mutated column:

```
status_events
├── id           PK
├── task_id      FK → tasks
├── status       TEXT        the status being entered
├── occurred_on  DATE        defaults to today, editable
├── changed_by   FK → users
└── created_at   TIMESTAMP
```

The `tasks.status` column holds the current value — denormalised so the common read needs no
aggregate — while `status_events` holds how it got there. A task's first event is written at
creation with status `todo` and `occurred_on = created_on`.

Because each event carries an editable date, the timeline can render a task's line segmented by
what it was doing when: in progress through August, blocked for ten days, then done. This is the
behaviour that makes the timeline worth having, rather than a row of dots.

Setting status to `done` sets `completed_on`; reopening clears it.

## 3. Status updates — FR-3

Free-text notes against a task, each with its own editable date.

```
status_updates
├── id           PK
├── task_id      FK → tasks
├── body         TEXT        free text, e.g. "Added frontend with theme"
├── occurred_on  DATE        defaults to today, editable (FR-3.2)
├── created_by   FK → users
├── created_at   TIMESTAMP
└── deleted_at   TIMESTAMP, null
```

Updates and status events are deliberately separate concepts: a note is not a state change, and
most notes do not accompany one. They are, however, entered together — the update composer has an
optional status selector, so recording *"blocked on the API key"* and setting the status to
`blocked` is one action, writing two rows. Two concepts in the data, one interaction in the UI.

An update's `occurred_on` may precede the task's `created_on`. Rather than reject it, the timeline
extends the line back to the earliest update — recording reality matters more than enforcing a rule
the user did not ask for.

## 4. API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/tasks?page_id=&status=&assigned_to=&sort=` | List; see sorting below |
| `GET` | `/api/tasks/:id` | One task with updates and status history |
| `POST` | `/api/tasks` | Create; only `title` required |
| `PATCH` | `/api/tasks/:id` | Any mutable field, including `created_on` |
| `PATCH` | `/api/tasks/:id/status` | Body `{ status, occurred_on? }`; writes a status event |
| `PATCH` | `/api/tasks/:id/position` | Manual reorder; see [`../pages/design.md`](../pages/design.md) |
| `DELETE` | `/api/tasks/:id` | Soft delete, undoable |
| `POST` | `/api/tasks/:id/updates` | Add an update, optionally with a status change |
| `PATCH` | `/api/updates/:id` | Edit body or date |
| `DELETE` | `/api/updates/:id` | Soft delete, undoable |
| `PATCH` | `/api/status-events/:id` | Correct a status event's date |

### 4.1 Creation defaults

```jsonc
{
  "title":       "required",
  "page_id":     "defaults to the caller's first page",
  "created_by":  "the current user",
  "assigned_to": "defaults to created_by",
  "status":      "todo",
  "created_on":  "today (FR-2.1); any past or future date accepted",
  "colour":      "next unused colour in the page's palette",
  "position":    "LexoRank key placing it at the BOTTOM of its page"
}
```

**New tasks are appended to the bottom.** The list is worked top-down, so the oldest incomplete task
stays at the top and new work queues behind it. Manual drag overrides this whenever the user wants.

### 4.2 Sorting

`position` is the *default* sort, not the only one. `GET /api/tasks` accepts `sort`:

| `sort` | Order |
| --- | --- |
| `manual` (default) | `position` — the user's drag order (FR-7) |
| `created_on` | Oldest first |
| `status` | `blocked`, `in_progress`, `todo`, `done` — what needs attention first |
| `title` | Alphabetical |

Manual order is always preserved in the database regardless of the active sort, so switching to a
different sort and back is lossless. Drag-to-reorder is disabled while a non-manual sort is active,
since dragging would have no persistent meaning.

This structure exists so that **conditional prioritisation** — ordering by proximity to a task's
location, by time of day, or by weekday — is a new `sort` value plus a scoring function, with no
change to storage or to the UI's list rendering. The location columns needed for the first of these
already exist; see [`../location/design.md`](../location/design.md).

## 5. Friction — FR-10

| Action | Cost |
| --- | --- |
| New task | `C` from anywhere, type title, `Enter` |
| New task on a page | Inline composer permanently at the list's foot |
| Status update | Click the task, type, `Enter` |
| Update plus status change | Same, with the status selector beside the input |
| Change status alone | Click the row's status chip, pick |
| Change a date | Click it, type `yesterday` or pick |
| Complete | Click the row's checkbox — sets `done`, writes the event |
| Undo anything | `Cmd/Ctrl+Z`, or the toast |

No modal dialog is used for routine work; task detail opens as a side sheet so surrounding context
stays visible.

## 6. Deletion and undo — FR-10.5

Deletes are soft: `deleted_at` is set and the row drops out of reads. Undo clears the column, which
restores the original id and every child row, and is why this is preferable to delete-and-reinsert.
A purge routine removes rows soft-deleted more than 30 days ago, running on boot.

## 7. Testing

| Case | Requirement |
| --- | --- |
| Create with a title only; defaults applied | FR-1.1 |
| Create backdated; `created_on` respected | FR-2.2 |
| Create with a future date | FR-2.3 |
| Add update, date defaults to today | FR-3.2 |
| Add update with an edited past date | FR-3.2 |
| Edit and delete an update | FR-3.3 |
| Status through the full lifecycle, events written | FR-4.1 |
| Blocked task renders as a distinct span | FR-4.1 |
| Completing sets `completed_on`; reopening clears it | FR-4.2 |
| Hide and show done tasks | FR-4.3 |
| Delete then undo restores the task and its children | FR-10.5 |
| New tasks append to the bottom | §4.1 |
| Switching sort and back preserves manual order | §4.2 |
