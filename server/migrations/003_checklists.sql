-- Migration 003 — checklist items on a task (DD-36).
--
-- A checklist is not a new kind of thing. "Buy groceries" and "get the car
-- serviced" are already tasks: they have a page, a status, a timeline and an
-- update stream. What they lack is the parts. Modelling a to-do list as its own
-- entity would duplicate every one of those and force each feature to be built
-- twice, so items hang off the task instead.

CREATE TABLE checklist_items (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  -- Fractional index, as with tasks and pages: reordering touches one row.
  position   TEXT NOT NULL,

  -- The two facts that make the history answerable. `added_on` and
  -- `checked_on` are dates, matching status_updates.occurred_on, because the
  -- question is "what did I buy, and when" at day resolution — not the second.
  --
  -- Kept on the item rather than derived from an update log: unchecking is then
  -- `checked_on = NULL` instead of a compensating entry, and "what is still
  -- outstanding" is a WHERE clause rather than a fold over history.
  added_on   TEXT NOT NULL,
  checked_on TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- The list read: every live item for a task, in order.
CREATE INDEX idx_checklist_items_task
  ON checklist_items(task_id, position) WHERE deleted_at IS NULL;

-- "What did I buy last Tuesday" — across tasks, by date.
CREATE INDEX idx_checklist_items_checked
  ON checklist_items(checked_on) WHERE deleted_at IS NULL AND checked_on IS NOT NULL;

-- Marks the update row that summarises a day's checklist activity, so it can be
-- found and rewritten as more items are ticked that same day rather than
-- appending a line per tick (DD-36). NULL for every update a person typed.
--
-- Nullable rather than a separate table: it is one attribute of an update, and
-- splitting it would make the timeline read a join for no gain.
ALTER TABLE status_updates ADD COLUMN checklist_day TEXT;

-- One summary per task per day. A partial unique index, so the many rows with
-- NULL are unaffected — this is what makes the rewrite an upsert.
CREATE UNIQUE INDEX idx_status_updates_checklist_day
  ON status_updates(task_id, checklist_day)
  WHERE checklist_day IS NOT NULL AND deleted_at IS NULL;
