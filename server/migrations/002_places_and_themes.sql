-- Migration 002 — places as first-class records, and the reduced theme set.
--
-- See DD-21 (theme is visual character, density owns size) and DD-23 (places).

-- A place is somewhere you return to: the office, the hardware store, home.
-- Naming it once and reusing it is what makes "what can I do while I am here"
-- answerable — free-text coordinates on each task cannot answer that, because
-- two tasks at the same place would carry unrelated strings.
CREATE TABLE places (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  lat        REAL,
  lng        REAL,
  -- Metres. Unused today; the trigger radius when arrival notifications are
  -- built, so it is cheaper to carry now than to migrate later (DD-12).
  radius_m   INTEGER NOT NULL DEFAULT 150,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_places_user ON places(user_id) WHERE deleted_at IS NULL;

ALTER TABLE tasks ADD COLUMN place_id TEXT REFERENCES places(id);

CREATE INDEX idx_tasks_place ON tasks(place_id) WHERE deleted_at IS NULL AND place_id IS NOT NULL;

-- Existing per-task locations become places, so nothing is lost. Tasks sharing
-- a label collapse onto one place, which is the point of the change.
INSERT INTO places (id, user_id, name, lat, lng, created_at)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-a' ||
    substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  t.created_by,
  t.location_label,
  -- Any coordinates recorded against the label; tasks with only a name get none.
  (SELECT t2.location_lat FROM tasks t2
    WHERE t2.location_label = t.location_label AND t2.location_lat IS NOT NULL LIMIT 1),
  (SELECT t2.location_lng FROM tasks t2
    WHERE t2.location_label = t.location_label AND t2.location_lng IS NOT NULL LIMIT 1),
  datetime('now')
FROM tasks t
WHERE t.location_label IS NOT NULL AND t.location_label != ''
GROUP BY t.location_label, t.created_by;

UPDATE tasks
   SET place_id = (
     SELECT p.id FROM places p
      WHERE p.name = tasks.location_label AND p.user_id = tasks.created_by
   )
 WHERE location_label IS NOT NULL AND location_label != '';

-- Theme values reduce to calm | neon (DD-21). `bold` and `dense` differed from
-- `calm` only in sizing, which density already controls, so they map onto calm
-- rather than onto neon — neither carried visual identity worth preserving.
CREATE TABLE settings_new (
  user_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme     TEXT NOT NULL DEFAULT 'calm'
            CHECK (theme IN ('calm', 'neon')),
  mode      TEXT NOT NULL DEFAULT 'system'
            CHECK (mode IN ('light', 'dark', 'system')),
  density   TEXT NOT NULL DEFAULT 'comfortable'
            CHECK (density IN ('comfortable', 'compact')),
  hide_done INTEGER NOT NULL DEFAULT 0
);

INSERT INTO settings_new (user_id, theme, mode, density, hide_done)
SELECT
  user_id,
  CASE WHEN theme = 'neon' THEN 'neon' ELSE 'calm' END,
  mode,
  -- `dense` as a theme meant "show me more", which is what compact density
  -- means; carry that intent across rather than dropping it.
  CASE WHEN theme = 'dense' THEN 'compact' ELSE density END,
  hide_done
FROM settings;

DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;
