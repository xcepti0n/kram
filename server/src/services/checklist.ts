/**
 * Checklist items on a task (DD-36).
 *
 * The list itself is ordinary CRUD over `checklist_items`. What earns a service
 * of its own is the history: adding and ticking items has to be visible in the
 * task's timeline without flooding it, so every change recomputes ONE summary
 * update for that task on that day rather than appending a line per item.
 */
import { randomUUID } from 'node:crypto';
import { between, today, type ChecklistItem, type StatusUpdate } from '@kram/shared';
import type { DB } from '../db/index.js';
import * as repo from '../repositories/index.js';
import { BadRequest, NotFound } from './tasks.js';

/** Cap per task: a list longer than this is really several tasks. */
const MAX_ITEMS = 200;

function requireTask(db: DB, userId: string, taskId: string) {
  const task = repo.getTask(db, userId, taskId);
  if (!task) throw new NotFound('task not found');
  return task;
}

function requireItem(db: DB, userId: string, itemId: string): ChecklistItem {
  const item = repo.getChecklistItem(db, userId, itemId);
  if (!item) throw new NotFound('checklist item not found');
  return item;
}

/**
 * Rewrite the summary of one day's checklist activity.
 *
 * Recomputed from the items themselves rather than incremented, so it stays
 * correct when an item is unticked, retitled or deleted later the same day —
 * an incrementing counter would drift on every one of those.
 *
 * Runs inside the caller's transaction.
 */
function syncDaySummary(db: DB, userId: string, taskId: string, day: string): void {
  const items = repo.listChecklistItems(db, [taskId]);
  const checked = items.filter((i) => i.checked_on === day);
  // An item added and ticked the same day — the normal shopping trip — is
  // reported once, as checked. Naming it under both verbs read as
  // "Checked off Milk, added Milk and Eggs", which is noise, not history.
  const added = items.filter((i) => i.added_on === day && i.checked_on !== day);

  const existing = repo.getChecklistUpdateForDay(db, taskId, day);

  // Nothing from this day survives — an item added and then deleted, or a tick
  // undone. The summary would be a lie, so it goes.
  if (added.length === 0 && checked.length === 0) {
    if (existing) repo.deleteChecklistUpdate(db, existing.id);
    return;
  }

  const body = summaryText(added, checked, items.length);

  if (existing) {
    repo.setChecklistUpdateBody(db, existing.id, body);
    return;
  }

  const now = new Date().toISOString();
  const update: StatusUpdate = {
    id: randomUUID(),
    task_id: taskId,
    body,
    occurred_on: day,
    created_by: userId,
    created_at: now,
  };
  repo.insertChecklistUpdate(db, update, day);
}

/**
 * The sentence that appears in the timeline.
 *
 * Names the items while there are few enough to read, and falls back to counts
 * beyond that — "Checked off milk, eggs and bread" is worth more than
 * "Checked off 3 items", but a twelve-item shop is not worth twelve names.
 */
function summaryText(
  added: readonly ChecklistItem[],
  checked: readonly ChecklistItem[],
  total: number,
): string {
  const parts: string[] = [];

  if (checked.length > 0) {
    parts.push(`Checked off ${describe(checked)}`);
  }
  if (added.length > 0) {
    parts.push(`${parts.length > 0 ? 'added' : 'Added'} ${describe(added)}`);
  }

  const sentence = `${parts.join(', ')}.`;
  // Call out a finished list; partial progress is already visible on the row.
  return total > 0 && checked.length >= total ? `${sentence} All ${total} done.` : sentence;
}

const NAME_LIMIT = 4;

function describe(items: readonly ChecklistItem[]): string {
  if (items.length > NAME_LIMIT) {
    return `${items.length} items`;
  }
  const names = items.map((i) => i.text);
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ------------------------------------------------------------ commands --- */

/** One item, or NotFound. Exposed so a route can read the task id before a
 *  delete removes the item it would have read it from. */
export function getItem(db: DB, userId: string, itemId: string): ChecklistItem {
  return requireItem(db, userId, itemId);
}

export function listItems(db: DB, userId: string, taskId: string): ChecklistItem[] {
  requireTask(db, userId, taskId);
  return repo.listChecklistItems(db, [taskId]);
}

export function addItem(
  db: DB,
  userId: string,
  taskId: string,
  input: { text: string; before_id?: string | null; after_id?: string | null },
): ChecklistItem {
  requireTask(db, userId, taskId);

  const existing = repo.checklistPositions(db, taskId);
  if (existing.length >= MAX_ITEMS) {
    throw new BadRequest(`a checklist is limited to ${MAX_ITEMS} items`);
  }

  // Default is append: the common case is typing into the box at the end.
  const before = input.before_id
    ? (existing.find((p) => p.id === input.before_id)?.position ?? null)
    : (existing[existing.length - 1]?.position ?? null);
  const after = input.after_id
    ? (existing.find((p) => p.id === input.after_id)?.position ?? null)
    : null;

  const now = new Date().toISOString();
  const day = today();
  const item: ChecklistItem = {
    id: randomUUID(),
    task_id: taskId,
    text: input.text,
    position: between(before, after),
    added_on: day,
    checked_on: null,
    created_at: now,
    updated_at: now,
  };

  db.transaction(() => {
    repo.insertChecklistItem(db, item);
    syncDaySummary(db, userId, taskId, day);
  })();

  return item;
}

export function updateItem(
  db: DB,
  userId: string,
  itemId: string,
  input: { text?: string; checked?: boolean },
): ChecklistItem {
  const item = requireItem(db, userId, itemId);
  const now = new Date().toISOString();
  const day = today();

  const fields: { text?: string; checked_on?: string | null } = {};
  if (input.text !== undefined) fields.text = input.text;
  if (input.checked !== undefined) {
    fields.checked_on = input.checked ? day : null;
  }

  // Unchecking has to re-sync the day the item was checked ON, not only today:
  // undoing yesterday's tick must correct yesterday's summary.
  const previousDay = item.checked_on;

  db.transaction(() => {
    repo.updateChecklistItem(db, itemId, fields, now);
    syncDaySummary(db, userId, item.task_id, day);
    if (previousDay && previousDay !== day) {
      syncDaySummary(db, userId, item.task_id, previousDay);
    }
  })();

  return requireItem(db, userId, itemId);
}

export function removeItem(db: DB, userId: string, itemId: string): void {
  const item = requireItem(db, userId, itemId);
  const now = new Date().toISOString();

  db.transaction(() => {
    repo.softDeleteChecklistItem(db, itemId, now);
    // Both days the item could appear in: when it was added, and when ticked.
    syncDaySummary(db, userId, item.task_id, item.added_on);
    if (item.checked_on && item.checked_on !== item.added_on) {
      syncDaySummary(db, userId, item.task_id, item.checked_on);
    }
  })();
}

export function moveItem(
  db: DB,
  userId: string,
  itemId: string,
  before_id: string | null,
  after_id: string | null,
): ChecklistItem {
  const item = requireItem(db, userId, itemId);
  const positions = repo.checklistPositions(db, item.task_id);
  const before = before_id ? (positions.find((p) => p.id === before_id)?.position ?? null) : null;
  const after = after_id ? (positions.find((p) => p.id === after_id)?.position ?? null) : null;

  repo.updateChecklistItem(db, itemId, { position: between(before, after) }, new Date().toISOString());
  return requireItem(db, userId, itemId);
}

/**
 * Clear every tick, keeping the items and their history.
 *
 * This is what makes a standing list reusable: groceries empties and refills
 * every week, where a car service is finished once. Completing the task would
 * be wrong for the first and unnecessary for the second, so the list resets
 * without touching the task's status (DD-36).
 *
 * Past summaries are left alone — they record what happened on those days, and
 * rewriting them would erase the history the checklist exists to keep.
 */
export function resetChecklist(db: DB, userId: string, taskId: string): ChecklistItem[] {
  requireTask(db, userId, taskId);
  const items = repo.listChecklistItems(db, [taskId]);
  const now = new Date().toISOString();
  const day = today();

  const checkedToday = items.filter((i) => i.checked_on === day);

  db.transaction(() => {
    for (const item of items) {
      if (item.checked_on) {
        repo.updateChecklistItem(db, item.id, { checked_on: null }, now);
      }
    }
    // Only today's summary can be affected; earlier days keep their record.
    if (checkedToday.length > 0) syncDaySummary(db, userId, taskId, day);
  })();

  return repo.listChecklistItems(db, [taskId]);
}
