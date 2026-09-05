-- Migration 001 — initial schema
--
-- Two ideas shape this (see .docs/sharing/design.md):
--   * Visibility belongs to the PAGE, via page_members, so a page can later be
--     shared with a second user without migrating populated tables.
--   * Assignment belongs to the TASK, via assigned_to, so within a shared page
--     it stays clear whose work each item is.
-- Neither surfaces in the UI today; there is one user and no login screen.

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE pages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  colour     TEXT NOT NULL,
  position   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Visibility. No role column yet (DD-13) — every member is equal until there is
-- a reason for them not to be, and adding `role` later is a one-line migration.
CREATE TABLE page_members (
  page_id  TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (page_id, user_id)
);

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  page_id        TEXT NOT NULL REFERENCES pages(id),
  created_by     TEXT NOT NULL REFERENCES users(id),
  assigned_to    TEXT REFERENCES users(id),
  title          TEXT NOT NULL,
  description    TEXT,
  -- Current value, denormalised so the common read needs no aggregate. Every
  -- change also writes a status_events row; the service layer keeps them in
  -- step and nothing else may write either (DD-15).
  status         TEXT NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  colour         TEXT NOT NULL,
  position       TEXT NOT NULL,
  -- The user's declared start date: editable, may be past or future (FR-2.2).
  -- Distinct from created_at, which is an immutable audit timestamp.
  created_on     TEXT NOT NULL,
  completed_on   TEXT,
  location_label TEXT,
  location_lat   REAL,
  location_lng   REAL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);

-- Free-text notes (FR-3.1). Separate from status_events because a note and a
-- state change are different facts, and most notes accompany no change (DD-16).
CREATE TABLE status_updates (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- State history. Drives the timeline's segmented lines, which is what makes a
-- blocked stretch visible as a distinct span rather than an invisible gap.
CREATE TABLE status_events (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status      TEXT NOT NULL
              CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  occurred_on TEXT NOT NULL,
  changed_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE settings (
  user_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme     TEXT NOT NULL DEFAULT 'calm'
            CHECK (theme IN ('calm', 'bold', 'dense')),
  mode      TEXT NOT NULL DEFAULT 'system'
            CHECK (mode IN ('light', 'dark', 'system')),
  density   TEXT NOT NULL DEFAULT 'comfortable'
            CHECK (density IN ('comfortable', 'compact')),
  hide_done INTEGER NOT NULL DEFAULT 0
);

-- Visibility join, on every read.
CREATE INDEX idx_page_members_user ON page_members(user_id, page_id);

-- Ordered page read.
CREATE INDEX idx_tasks_page_position ON tasks(page_id, position) WHERE deleted_at IS NULL;

-- Timeline range query.
CREATE INDEX idx_tasks_page_created_on ON tasks(page_id, created_on) WHERE deleted_at IS NULL;

-- Timeline assembly.
CREATE INDEX idx_status_updates_task ON status_updates(task_id, occurred_on) WHERE deleted_at IS NULL;
CREATE INDEX idx_status_events_task ON status_events(task_id, occurred_on);

-- Purge sweep for soft-deleted rows.
CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
