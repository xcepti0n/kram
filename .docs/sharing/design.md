# Feature Design — Users & Page Sharing

**Status:** Approved
**Last updated:** 2026-09-04
**Requirements:** NFR-6.3, FR-6 · **Parent:** [`../DESIGN.md`](../DESIGN.md)

Sharing is not built yet — there is one user and no login screen. This document defines the schema
so that turning it on later is additive rather than a migration of populated tables.

---

## 1. The problem with the earlier design

The first schema hung ownership directly off each row: `pages.user_id`, `tasks.user_id`. That model
cannot express a page belonging to two people. Adding sharing later would have meant migrating
every populated table and rewriting every query's ownership check — precisely the rewrite the
"design for multi-user" instruction was meant to avoid.

The fix is to separate **membership** from **assignment**:

- Membership is a property of the *page*, held in a join table. It answers *who can see this?*
- Assignment is a property of the *task*. It answers *whose task is this?*

Pages no longer carry an owner column; tasks no longer carry a user column.

## 2. Schema

```
┌──────────────┐
│    users     │   One row for now.
│──────────────│
│ id      PK   │
│ name         │
│ created_at   │
└──┬────────┬──┘
   │        │
   │ ∗      │ ∗
   │        └──────────────────────────────────┐
   │                                           │
┌──▼───────────────────┐                       │
│    page_members      │                       │
│──────────────────────│                       │
│ page_id  FK → pages  │  PRIMARY KEY          │
│ user_id  FK → users  │  (page_id, user_id)   │
│ added_at TIMESTAMP   │                       │
└──┬───────────────────┘                       │
   │ ∗                                         │
   │                                           │
┌──▼───────────┐                               │
│    pages     │   No owner column — membership│
│──────────────│   is the whole ownership story│
│ id      PK   │                               │
│ name         │                               │
│ colour       │                               │
│ position     │                               │
│ created_at   │                               │
└──┬───────────┘                               │
   │ 1                                         │
   │                                           │
   │ ∗                                         │
┌──▼────────────────────────┐                  │
│          tasks            │                  │
│───────────────────────────│                  │
│ id           PK           │                  │
│ page_id      FK → pages   │  visibility      │
│ created_by   FK → users ──┼──────────────────┤  attribution
│ assigned_to  FK → users ──┼──────────────────┘  whose task it is
│ … (see ../tasks/design.md)│
└───────────────────────────┘
```

`page_members` deliberately has **no role column** yet. Every member is equal: they can read and
write everything on the page. Adding `role` later is a one-line migration with a default, because
the table already exists and every query already joins through it.

## 3. Visibility versus assignment

The distinction carries the whole design, and is worth being precise about.

**`page_members` controls visibility.** A user sees a page, and therefore every task on it, if a
membership row exists. All access checks resolve through this join and nothing else.

**`assigned_to` controls whose task it is.** It defaults to `created_by`, so today, with one user,
every task is created by and assigned to that user and nothing in the UI changes.

Once a page is shared, this yields the useful behaviours for free:

- *"My tasks"* is a filter on `assigned_to = me`
- *"Unassigned"* is `assigned_to IS NULL` — a shared backlog anyone can pick up
- Handing a task to someone else is a `PATCH` of one column, no schema change
- The timeline can colour or group by assignee, or filter to one person

`created_by` is kept separately from `assigned_to` because attribution and responsibility are
different facts. Reassigning a task should not rewrite who wrote it down.

## 4. Access resolution

Every query resolves the current user's visible pages through membership:

```sql
-- pages the user can see
SELECT p.* FROM pages p
JOIN page_members m ON m.page_id = p.id
WHERE m.user_id = ?
ORDER BY p.position;

-- tasks the user can see
SELECT t.* FROM tasks t
JOIN page_members m ON m.page_id = t.page_id
WHERE m.user_id = ? AND t.deleted_at IS NULL;
```

This check lives in the repository layer, applied uniformly. No route or service constructs its own
ownership predicate — one place to get right, and one place to audit.

Indexes: `page_members(user_id, page_id)` for the visibility join, and
`tasks(page_id, position)` for the ordered page read.

## 5. Current behaviour — single user

The server resolves a fixed default user on every request. Migration 001 seeds that user, a first
page, and the `page_members` row joining them. Everything above is already in force; there is simply
one member on every page.

There is no login screen, no session, and no user switcher. The friction requirement (FR-10) is
unaffected.

## 6. Turning sharing on later

Additive, in this order:

1. **Sessions and login.** A session mechanism, a login route, and resolving the user from the
   session instead of the fixed default. This is the only substantial piece of work.
2. **Invite a user to a page.** `POST /api/pages/:id/members` inserting a `page_members` row.
3. **Assignment UI.** An assignee control on the task, and an "assigned to" filter.
4. **Roles, if wanted.** Add `role` to `page_members` with a default of `editor`, and check it in
   the repository layer.

No existing table changes shape. No data migrates. Steps 2 to 4 are small because the schema already
accommodates them.

## 7. Deferred

**Roles and permissions.** Deliberately absent. Every member is equal until there is a reason for
them not to be, and the table is shaped to accept a role column without disruption.

**Sharing a single task rather than a page.** Not supported: the page is the unit of sharing. A task
lives on exactly one page, and inherits its visibility. Per-task sharing would need its own
membership table and a precedence rule between the two — real complexity, for a case that has not
come up.

**External or link-based sharing.** Out of scope. Sharing is between known users on a private
network.

## 8. Testing

Deferred with the feature, but the schema is exercised now:

| Case | Coverage |
| --- | --- |
| Seeded default user has a membership row for the seeded page | Migration test |
| Task creation sets `created_by` and defaults `assigned_to` to it | Unit |
| Visibility join returns only pages the user is a member of | Unit |
| A task on a non-member page is invisible, including by direct id | Unit |
