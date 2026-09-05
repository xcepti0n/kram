/**
 * Repository layer — the only code in the application that touches SQL.
 *
 * Every read resolves visibility through `page_members` (DD-4, DD-13). No route
 * or service constructs its own ownership predicate: one place to get right, and
 * one place to audit.
 */
import type { DB } from '../db/index.js';
import type {
  Page,
  Place,
  Settings,
  StatusEvent,
  StatusUpdate,
  Task,
  TaskStatus,
} from '@tasktracker/shared';

/* ---------------------------------------------------------------- rows --- */

interface SettingsRow {
  user_id: string;
  theme: string;
  mode: string;
  density: string;
  hide_done: number;
}

function toSettings(row: SettingsRow): Settings {
  return {
    user_id: row.user_id,
    theme: row.theme as Settings['theme'],
    mode: row.mode as Settings['mode'],
    density: row.density as Settings['density'],
    hide_done: row.hide_done === 1,
  };
}

/* --------------------------------------------------------------- pages --- */

export function listPages(db: DB, userId: string): Page[] {
  return db
    .prepare(
      `SELECT p.id, p.name, p.colour, p.position, p.created_at
         FROM pages p
         JOIN page_members m ON m.page_id = p.id
        WHERE m.user_id = ? AND p.deleted_at IS NULL
        ORDER BY p.position`,
    )
    .all(userId) as Page[];
}

/** A page the user can see, or undefined. The membership join is the access check. */
export function getPage(db: DB, userId: string, pageId: string): Page | undefined {
  return db
    .prepare(
      `SELECT p.id, p.name, p.colour, p.position, p.created_at
         FROM pages p
         JOIN page_members m ON m.page_id = p.id
        WHERE m.user_id = ? AND p.id = ? AND p.deleted_at IS NULL`,
    )
    .get(userId, pageId) as Page | undefined;
}

export function insertPage(
  db: DB,
  page: Omit<Page, 'created_at'> & { created_at: string },
  userId: string,
): void {
  db.transaction(() => {
    db.prepare(
      'INSERT INTO pages (id, name, colour, position, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(page.id, page.name, page.colour, page.position, page.created_at);
    db.prepare('INSERT INTO page_members (page_id, user_id, added_at) VALUES (?, ?, ?)').run(
      page.id,
      userId,
      page.created_at,
    );
  })();
}

export function updatePage(
  db: DB,
  pageId: string,
  fields: Partial<Pick<Page, 'name' | 'colour' | 'position'>>,
): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const set = entries.map(([k]) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE pages SET ${set} WHERE id = ?`).run(...entries.map(([, v]) => v), pageId);
}

export function softDeletePage(db: DB, pageId: string, at: string): void {
  db.prepare('UPDATE pages SET deleted_at = ? WHERE id = ?').run(at, pageId);
}

export function countPages(db: DB, userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM pages p
         JOIN page_members m ON m.page_id = p.id
        WHERE m.user_id = ? AND p.deleted_at IS NULL`,
    )
    .get(userId) as { n: number };
  return row.n;
}

/* --------------------------------------------------------------- tasks --- */

const TASK_COLUMNS = `
  t.id, t.page_id, t.created_by, t.assigned_to, t.title, t.description,
  t.status, t.colour, t.position, t.created_on, t.completed_on,
  t.place_id, t.location_label, t.location_lat, t.location_lng,
  t.created_at, t.updated_at
`;

export interface ListTasksOptions {
  pageId?: string;
  includeDone?: boolean;
  assignedTo?: string;
  status?: TaskStatus;
  locationLabel?: string;
  placeId?: string;
}

export function listTasks(db: DB, userId: string, options: ListTasksOptions = {}): Task[] {
  const where: string[] = ['m.user_id = ?', 't.deleted_at IS NULL'];
  const params: unknown[] = [userId];

  if (options.pageId) {
    where.push('t.page_id = ?');
    params.push(options.pageId);
  }
  if (options.includeDone === false) {
    where.push("t.status != 'done'");
  }
  if (options.assignedTo) {
    where.push('t.assigned_to = ?');
    params.push(options.assignedTo);
  }
  if (options.status) {
    where.push('t.status = ?');
    params.push(options.status);
  }
  if (options.locationLabel) {
    where.push('t.location_label = ?');
    params.push(options.locationLabel);
  }
  if (options.placeId) {
    where.push('t.place_id = ?');
    params.push(options.placeId);
  }

  // Always ordered by position; alternative sorts are applied in the service
  // layer so that manual order stays the stored truth (DD-17).
  return db
    .prepare(
      `SELECT ${TASK_COLUMNS}
         FROM tasks t
         JOIN page_members m ON m.page_id = t.page_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.position`,
    )
    .all(...params) as Task[];
}

export function getTask(db: DB, userId: string, taskId: string): Task | undefined {
  return db
    .prepare(
      `SELECT ${TASK_COLUMNS}
         FROM tasks t
         JOIN page_members m ON m.page_id = t.page_id
        WHERE m.user_id = ? AND t.id = ? AND t.deleted_at IS NULL`,
    )
    .get(userId, taskId) as Task | undefined;
}

export function insertTask(db: DB, task: Task): void {
  db.prepare(
    `INSERT INTO tasks (
       id, page_id, created_by, assigned_to, title, description, status, colour,
       position, created_on, completed_on, place_id, location_label,
       location_lat, location_lng, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    task.id,
    task.page_id,
    task.created_by,
    task.assigned_to,
    task.title,
    task.description,
    task.status,
    task.colour,
    task.position,
    task.created_on,
    task.completed_on,
    task.place_id,
    task.location_label,
    task.location_lat,
    task.location_lng,
    task.created_at,
    task.updated_at,
  );
}

const MUTABLE_TASK_FIELDS = [
  'page_id', 'assigned_to', 'title', 'description', 'status', 'colour',
  'position', 'created_on', 'completed_on', 'place_id', 'location_label',
  'location_lat', 'location_lng',
] as const;

export function updateTask(
  db: DB,
  taskId: string,
  fields: Partial<Record<(typeof MUTABLE_TASK_FIELDS)[number], unknown>>,
  updatedAt: string,
): void {
  const entries = Object.entries(fields).filter(
    ([k, v]) => v !== undefined && (MUTABLE_TASK_FIELDS as readonly string[]).includes(k),
  );
  if (entries.length === 0) return;
  const set = entries.map(([k]) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE tasks SET ${set}, updated_at = ? WHERE id = ?`).run(
    ...entries.map(([, v]) => v),
    updatedAt,
    taskId,
  );
}

export function softDeleteTask(db: DB, taskId: string, at: string): void {
  db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(at, at, taskId);
}

export function restoreTask(db: DB, taskId: string, at: string): void {
  db.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(at, taskId);
}

/** A soft-deleted task, for undo. Bypasses the deleted_at filter but keeps the
 *  visibility check. */
export function getDeletedTask(db: DB, userId: string, taskId: string): Task | undefined {
  return db
    .prepare(
      `SELECT ${TASK_COLUMNS}
         FROM tasks t
         JOIN page_members m ON m.page_id = t.page_id
        WHERE m.user_id = ? AND t.id = ? AND t.deleted_at IS NOT NULL`,
    )
    .get(userId, taskId) as Task | undefined;
}

export function moveTasksToPage(db: DB, fromPageId: string, toPageId: string, at: string): number {
  return db
    .prepare('UPDATE tasks SET page_id = ?, updated_at = ? WHERE page_id = ? AND deleted_at IS NULL')
    .run(toPageId, at, fromPageId).changes;
}

export function softDeleteTasksOnPage(db: DB, pageId: string, at: string): number {
  return db
    .prepare(
      'UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE page_id = ? AND deleted_at IS NULL',
    )
    .run(at, at, pageId).changes;
}

/** Positions of a page's live tasks, in order — used to place and rebalance. */
export function taskPositions(db: DB, pageId: string): { id: string; position: string }[] {
  return db
    .prepare(
      'SELECT id, position FROM tasks WHERE page_id = ? AND deleted_at IS NULL ORDER BY position',
    )
    .all(pageId) as { id: string; position: string }[];
}

export function taskColours(db: DB, pageId: string): string[] {
  return (
    db
      .prepare('SELECT colour FROM tasks WHERE page_id = ? AND deleted_at IS NULL')
      .all(pageId) as { colour: string }[]
  ).map((r) => r.colour);
}

/* ------------------------------------------------------------- updates --- */

export function listUpdates(db: DB, taskIds: readonly string[]): StatusUpdate[] {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT id, task_id, body, occurred_on, created_by, created_at
         FROM status_updates
        WHERE task_id IN (${placeholders}) AND deleted_at IS NULL
        ORDER BY occurred_on, created_at`,
    )
    .all(...taskIds) as StatusUpdate[];
}

export function insertUpdate(db: DB, update: StatusUpdate): void {
  db.prepare(
    `INSERT INTO status_updates (id, task_id, body, occurred_on, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    update.id,
    update.task_id,
    update.body,
    update.occurred_on,
    update.created_by,
    update.created_at,
  );
}

/** An update the user can see, resolved through its task's page membership. */
export function getUpdate(db: DB, userId: string, updateId: string): StatusUpdate | undefined {
  return db
    .prepare(
      `SELECT u.id, u.task_id, u.body, u.occurred_on, u.created_by, u.created_at
         FROM status_updates u
         JOIN tasks t ON t.id = u.task_id
         JOIN page_members m ON m.page_id = t.page_id
        WHERE m.user_id = ? AND u.id = ? AND u.deleted_at IS NULL`,
    )
    .get(userId, updateId) as StatusUpdate | undefined;
}

export function editUpdate(
  db: DB,
  updateId: string,
  fields: Partial<Pick<StatusUpdate, 'body' | 'occurred_on'>>,
): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const set = entries.map(([k]) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE status_updates SET ${set} WHERE id = ?`).run(
    ...entries.map(([, v]) => v),
    updateId,
  );
}

export function softDeleteUpdate(db: DB, updateId: string, at: string): void {
  db.prepare('UPDATE status_updates SET deleted_at = ? WHERE id = ?').run(at, updateId);
}

export function restoreUpdate(db: DB, updateId: string): void {
  db.prepare('UPDATE status_updates SET deleted_at = NULL WHERE id = ?').run(updateId);
}

export function getDeletedUpdate(
  db: DB,
  userId: string,
  updateId: string,
): StatusUpdate | undefined {
  return db
    .prepare(
      `SELECT u.id, u.task_id, u.body, u.occurred_on, u.created_by, u.created_at
         FROM status_updates u
         JOIN tasks t ON t.id = u.task_id
         JOIN page_members m ON m.page_id = t.page_id
        WHERE m.user_id = ? AND u.id = ? AND u.deleted_at IS NOT NULL`,
    )
    .get(userId, updateId) as StatusUpdate | undefined;
}

/* -------------------------------------------------------- status events --- */

export function listStatusEvents(db: DB, taskIds: readonly string[]): StatusEvent[] {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT id, task_id, status, occurred_on, changed_by, created_at
         FROM status_events
        WHERE task_id IN (${placeholders})
        ORDER BY occurred_on, created_at`,
    )
    .all(...taskIds) as StatusEvent[];
}

export function insertStatusEvent(db: DB, event: StatusEvent): void {
  db.prepare(
    `INSERT INTO status_events (id, task_id, status, occurred_on, changed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.task_id,
    event.status,
    event.occurred_on,
    event.changed_by,
    event.created_at,
  );
}

export function getStatusEvent(db: DB, userId: string, eventId: string): StatusEvent | undefined {
  return db
    .prepare(
      `SELECT e.id, e.task_id, e.status, e.occurred_on, e.changed_by, e.created_at
         FROM status_events e
         JOIN tasks t ON t.id = e.task_id
         JOIN page_members m ON m.page_id = t.page_id
        WHERE m.user_id = ? AND e.id = ?`,
    )
    .get(userId, eventId) as StatusEvent | undefined;
}

export function editStatusEvent(db: DB, eventId: string, occurredOn: string): void {
  db.prepare('UPDATE status_events SET occurred_on = ? WHERE id = ?').run(occurredOn, eventId);
}

/* -------------------------------------------------------------- places --- */

export function listPlaces(db: DB, userId: string): Place[] {
  return db
    .prepare(
      `SELECT id, name, lat, lng, radius_m, created_at
         FROM places
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY name COLLATE NOCASE`,
    )
    .all(userId) as Place[];
}

export function getPlace(db: DB, userId: string, placeId: string): Place | undefined {
  return db
    .prepare(
      `SELECT id, name, lat, lng, radius_m, created_at
         FROM places
        WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .get(userId, placeId) as Place | undefined;
}

/** Match by name, case-insensitively — saving "Office" twice should reuse the
 *  first rather than creating a near-duplicate. */
export function findPlaceByName(db: DB, userId: string, name: string): Place | undefined {
  return db
    .prepare(
      `SELECT id, name, lat, lng, radius_m, created_at
         FROM places
        WHERE user_id = ? AND name = ? COLLATE NOCASE AND deleted_at IS NULL`,
    )
    .get(userId, name) as Place | undefined;
}

export function insertPlace(db: DB, place: Place, userId: string): void {
  db.prepare(
    `INSERT INTO places (id, user_id, name, lat, lng, radius_m, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(place.id, userId, place.name, place.lat, place.lng, place.radius_m, place.created_at);
}

export function updatePlace(
  db: DB,
  placeId: string,
  fields: Partial<Pick<Place, 'name' | 'lat' | 'lng' | 'radius_m'>>,
): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const set = entries.map(([k]) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE places SET ${set} WHERE id = ?`).run(...entries.map(([, v]) => v), placeId);
}

/** Soft-delete a place and detach it from its tasks, so a task never points at
 *  a place that is no longer listed. */
export function softDeletePlace(db: DB, placeId: string, at: string): void {
  db.transaction(() => {
    db.prepare('UPDATE tasks SET place_id = NULL, updated_at = ? WHERE place_id = ?').run(
      at,
      placeId,
    );
    db.prepare('UPDATE places SET deleted_at = ? WHERE id = ?').run(at, placeId);
  })();
}

/** How many live tasks reference each place — shown beside it when choosing. */
export function placeTaskCounts(db: DB, userId: string): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT t.place_id AS id, COUNT(*) AS n
         FROM tasks t
         JOIN page_members m ON m.page_id = t.page_id
        WHERE m.user_id = ? AND t.deleted_at IS NULL AND t.place_id IS NOT NULL
        GROUP BY t.place_id`,
    )
    .all(userId) as { id: string; n: number }[];
  return new Map(rows.map((r) => [r.id, r.n]));
}

/* ------------------------------------------------------------ settings --- */

export function getSettings(db: DB, userId: string): Settings {
  const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as
    | SettingsRow
    | undefined;
  if (row) return toSettings(row);
  db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(userId);
  return toSettings(db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as SettingsRow);
}

export function updateSettings(
  db: DB,
  userId: string,
  fields: Partial<Omit<Settings, 'user_id'>>,
): void {
  const entries = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 1 : 0) : v] as const);
  if (entries.length === 0) return;
  const set = entries.map(([k]) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE settings SET ${set} WHERE user_id = ?`).run(
    ...entries.map(([, v]) => v),
    userId,
  );
}
