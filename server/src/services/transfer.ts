/**
 * Export and import (FR-11, DD-14).
 *
 * A portable, human-readable snapshot independent of the storage engine. Serves
 * three purposes: a backup that does not depend on Proxmox, a migration path off
 * SQLite, and the assurance that the data is not trapped in a format only this
 * app understands.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportDocument,
  type ExportDocument,
  type ImportMode,
} from '@kram/shared';
import type { DB } from '../db/index.js';
import { BadRequest } from './tasks.js';

interface RawTask {
  id: string;
  page_id: string;
  created_by: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: string;
  colour: string;
  position: string;
  created_on: string;
  completed_on: string | null;
  location_label: string | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * The whole dataset, with children nested inside their parent — the file is meant
 * to be read by a person, and nesting is how a person reads it.
 *
 * Real ids are preserved so an export can round-trip back into the same database
 * without duplicating rows.
 */
export function exportAll(db: DB, includeDeleted = false): ExportDocument {
  const deletedFilter = includeDeleted ? '' : 'AND deleted_at IS NULL';

  const users = db.prepare('SELECT id, name, created_at FROM users ORDER BY created_at').all() as {
    id: string;
    name: string;
    created_at: string;
  }[];

  const pages = (
    db
      .prepare(`SELECT id, name, colour, position, created_at FROM pages WHERE 1=1 ${deletedFilter} ORDER BY position`)
      .all() as { id: string; name: string; colour: string; position: string; created_at: string }[]
  ).map((page) => ({
    ...page,
    members: (
      db.prepare('SELECT user_id FROM page_members WHERE page_id = ?').all(page.id) as {
        user_id: string;
      }[]
    ).map((m) => m.user_id),
  }));

  const tasks = (
    db
      .prepare(`SELECT * FROM tasks WHERE 1=1 ${deletedFilter} ORDER BY page_id, position`)
      .all() as RawTask[]
  ).map((task) => {
    const updates = db
      .prepare(
        `SELECT id, task_id, body, occurred_on, created_by, created_at, deleted_at, checklist_day
           FROM status_updates WHERE task_id = ? ${deletedFilter} ORDER BY occurred_on, created_at`,
      )
      .all(task.id);
    // Checklist items travel with their task (DD-36). Without this a backup
    // silently drops every list, which is the failure a backup exists to avoid.
    const checklist = db
      .prepare(
        `SELECT id, task_id, text, position, added_on, checked_on,
                created_at, updated_at, deleted_at
           FROM checklist_items WHERE task_id = ? ${deletedFilter} ORDER BY position`,
      )
      .all(task.id);
    const events = db
      .prepare(
        `SELECT id, task_id, status, occurred_on, changed_by, created_at
           FROM status_events WHERE task_id = ? ORDER BY occurred_on, created_at`,
      )
      .all(task.id);

    const { deleted_at, ...rest } = task;
    return {
      ...rest,
      ...(includeDeleted ? { deleted_at } : {}),
      updates: updates.map((u) => {
        const row = u as Record<string, unknown>;
        if (!includeDeleted) delete row.deleted_at;
        return row;
      }),
      status_events: events,
      checklist: checklist.map((c) => {
        const row = c as Record<string, unknown>;
        if (!includeDeleted) delete row.deleted_at;
        return row;
      }),
    };
  });

  const places = db
    .prepare(
      `SELECT id, user_id, name, lat, lng, radius_m, created_at
         FROM places WHERE deleted_at IS NULL ORDER BY name`,
    )
    .all();

  const settings = (
    db.prepare('SELECT * FROM settings').all() as {
      user_id: string;
      theme: string;
      mode: string;
      density: string;
      hide_done: number;
    }[]
  ).map((s) => ({ ...s, hide_done: s.hide_done === 1 }));

  const doc = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    users,
    pages,
    places,
    tasks,
    settings,
  };

  // Validate our own output: an export that cannot be re-imported is worthless,
  // and this catches drift between the schema and the format.
  return exportDocument.parse(doc);
}

export interface ImportResult {
  mode: ImportMode;
  users: number;
  pages: number;
  tasks: number;
  updates: number;
  status_events: number;
  checklist_items: number;
  backup?: string;
}

/**
 * Restore an export. The whole operation runs in one transaction, so a malformed
 * file leaves the database untouched (FR-11.3).
 *
 * `replace` is the one destructive path in the app that a toast cannot undo, so
 * a pre-import backup is written to `data/backups/` first.
 */
export function importAll(
  db: DB,
  raw: unknown,
  mode: ImportMode,
  dataDir: string,
): ImportResult {
  const parsed = exportDocument.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new BadRequest(`invalid export document — ${issues.join('; ')}`);
  }
  const doc = parsed.data;

  if (doc.version > EXPORT_VERSION) {
    throw new BadRequest(
      `export version ${doc.version} is newer than this app understands (${EXPORT_VERSION})`,
    );
  }

  const result: ImportResult = {
    mode,
    users: 0,
    pages: 0,
    tasks: 0,
    updates: 0,
    status_events: 0,
    checklist_items: 0,
  };

  if (mode === 'replace') {
    result.backup = writeBackup(db, dataDir);
  }

  // Fresh ids for duplicate mode, keeping references consistent across the file.
  const remap = new Map<string, string>();
  const idFor = (original: string): string => {
    if (mode !== 'duplicate') return original;
    let next = remap.get(original);
    if (!next) {
      next = randomUUID();
      remap.set(original, next);
    }
    return next;
  };

  const run = db.transaction(() => {
    if (mode === 'replace') {
      // Children first — foreign keys are on.
      db.exec('DELETE FROM checklist_items');
      db.exec('DELETE FROM status_events');
      db.exec('DELETE FROM status_updates');
      db.exec('DELETE FROM tasks');
      db.exec('DELETE FROM places');
      db.exec('DELETE FROM page_members');
      db.exec('DELETE FROM pages');
      db.exec('DELETE FROM settings');
      db.exec('DELETE FROM users');
    }

    const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?');
    for (const user of doc.users) {
      // Users are never duplicated: a shared page's members must keep resolving
      // to the same people after an import.
      if (userExists.get(user.id)) continue;
      db.prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)').run(
        user.id,
        user.name,
        user.created_at,
      );
      result.users += 1;
    }

    const pageExists = db.prepare('SELECT 1 FROM pages WHERE id = ?');
    for (const page of doc.pages) {
      const pageId = idFor(page.id);
      if (mode === 'merge' && pageExists.get(pageId)) continue;
      if (mode === 'duplicate' && pageExists.get(pageId)) continue;

      db.prepare(
        'INSERT INTO pages (id, name, colour, position, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(pageId, page.name, page.colour, page.position, page.created_at);
      result.pages += 1;

      for (const member of page.members) {
        if (!userExists.get(member)) continue; // a member we do not know about
        db.prepare(
          'INSERT OR IGNORE INTO page_members (page_id, user_id, added_at) VALUES (?, ?, ?)',
        ).run(pageId, member, page.created_at);
      }
    }

    const placeExists = db.prepare('SELECT 1 FROM places WHERE id = ?');
    for (const place of doc.places ?? []) {
      const placeId = idFor(place.id);
      if (mode !== 'replace' && placeExists.get(placeId)) continue;
      if (!userExists.get(place.user_id)) continue;
      db.prepare(
        `INSERT INTO places (id, user_id, name, lat, lng, radius_m, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(placeId, place.user_id, place.name, place.lat, place.lng, place.radius_m, place.created_at);
    }

    const taskExists = db.prepare('SELECT 1 FROM tasks WHERE id = ?');
    for (const task of doc.tasks) {
      const taskId = idFor(task.id);
      if (mode !== 'replace' && taskExists.get(taskId)) continue;

      const pageId = idFor(task.page_id);
      if (!pageExists.get(pageId)) continue; // orphan: its page is not present

      db.prepare(
        `INSERT INTO tasks (
           id, page_id, created_by, assigned_to, title, description, status, colour,
           position, created_on, completed_on, place_id, location_label,
           location_lat, location_lng, created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        taskId,
        pageId,
        task.created_by,
        task.assigned_to,
        task.title,
        task.description,
        task.status,
        task.colour,
        task.position,
        task.created_on,
        task.completed_on,
        task.place_id ? idFor(task.place_id) : null,
        task.location_label,
        task.location_lat,
        task.location_lng,
        task.created_at,
        task.updated_at,
        task.deleted_at ?? null,
      );
      result.tasks += 1;

      for (const update of task.updates) {
        db.prepare(
          `INSERT INTO status_updates
             (id, task_id, body, occurred_on, created_by, created_at, deleted_at, checklist_day)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          idFor(update.id),
          taskId,
          update.body,
          update.occurred_on,
          update.created_by,
          update.created_at,
          update.deleted_at ?? null,
          // Carried across so a restored day-summary is still recognised as
          // one; dropping it would make the next tick write a second row for
          // the same day, which the partial unique index would then reject.
          (update as { checklist_day?: string | null }).checklist_day ?? null,
        );
        result.updates += 1;
      }

      for (const item of task.checklist ?? []) {
        db.prepare(
          `INSERT INTO checklist_items
             (id, task_id, text, position, added_on, checked_on, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          idFor(item.id),
          taskId,
          item.text,
          item.position,
          item.added_on,
          item.checked_on,
          item.created_at,
          item.updated_at,
          item.deleted_at ?? null,
        );
        result.checklist_items += 1;
      }

      for (const event of task.status_events) {
        db.prepare(
          `INSERT INTO status_events (id, task_id, status, occurred_on, changed_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          idFor(event.id),
          taskId,
          event.status,
          event.occurred_on,
          event.changed_by,
          event.created_at,
        );
        result.status_events += 1;
      }
    }

    for (const s of doc.settings) {
      if (!userExists.get(s.user_id)) continue;
      db.prepare(
        `INSERT INTO settings (user_id, theme, mode, density, hide_done)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           theme = excluded.theme, mode = excluded.mode,
           density = excluded.density, hide_done = excluded.hide_done`,
      ).run(s.user_id, s.theme, s.mode, s.density, s.hide_done ? 1 : 0);
    }
  });

  run();
  return result;
}

function writeBackup(db: DB, dataDir: string): string {
  const dir = join(dataDir, 'backups');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `pre-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(exportAll(db, true), null, 2), 'utf8');
  return file;
}
