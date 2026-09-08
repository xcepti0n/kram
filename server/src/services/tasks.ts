/**
 * Task service — creation defaults, status transitions, ordering and sorting.
 *
 * The rule that matters most here: `tasks.status` and `status_events` are always
 * written together, in one transaction, and nothing outside this module may write
 * either (DD-15). The denormalised column keeps the common read free of an
 * aggregate; the events table is what lets the timeline draw segmented lines.
 */
import { randomUUID } from 'node:crypto';
import {
  between,
  needsRebalance,
  nextColour,
  rebalance,
  today,
  type ChangeStatusInput,
  type CreateTaskInput,
  type CreateUpdateInput,
  type SortMode,
  type StatusEvent,
  type StatusUpdate,
  type Task,
  type TaskStatus,
  type TaskWithChildren,
  type UpdateTaskInput,
} from '@kram/shared';
import type { DB } from '../db/index.js';
import * as repo from '../repositories/index.js';

export class NotFound extends Error {
  constructor(what = 'not found') {
    super(what);
    this.name = 'NotFound';
  }
}

export class BadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequest';
  }
}

const STATUS_SORT_ORDER: Record<TaskStatus, number> = {
  blocked: 0,
  in_progress: 1,
  todo: 2,
  done: 3,
};

/* -------------------------------------------------------------- reading --- */

export function listTasks(
  db: DB,
  userId: string,
  options: repo.ListTasksOptions & { sort?: SortMode } = {},
): Task[] {
  const tasks = repo.listTasks(db, userId, options);
  return applySort(tasks, options.sort ?? 'manual');
}

/**
 * Sorting happens here rather than in SQL so that `position` — the manual order —
 * remains the stored truth regardless of the active view (DD-17). Switching sort
 * and back is therefore lossless.
 */
export function applySort(tasks: readonly Task[], sort: SortMode): Task[] {
  const list = [...tasks];
  switch (sort) {
    case 'manual':
      return list; // already ordered by position
    case 'created':
      return list.sort((a, b) => a.created_on.localeCompare(b.created_on) || a.position.localeCompare(b.position));
    case 'status':
      return list.sort(
        (a, b) =>
          STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status] ||
          a.position.localeCompare(b.position),
      );
    case 'title':
      return list.sort(
        (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      );
    default:
      return list;
  }
}

export function getTaskWithChildren(
  db: DB,
  userId: string,
  taskId: string,
): TaskWithChildren | undefined {
  const task = repo.getTask(db, userId, taskId);
  if (!task) return undefined;
  return {
    ...task,
    updates: repo.listUpdates(db, [taskId]),
    status_events: repo.listStatusEvents(db, [taskId]),
    checklist: repo.listChecklistItems(db, [taskId]),
  };
}

/* ------------------------------------------------------------- creating --- */

export function createTask(db: DB, userId: string, input: CreateTaskInput): TaskWithChildren {
  const pageId = input.page_id ?? firstPageId(db, userId);
  const page = repo.getPage(db, userId, pageId);
  if (!page) throw new NotFound('page not found');

  const now = new Date().toISOString();
  const createdOn = input.created_on ?? today();
  const status: TaskStatus = input.status ?? 'todo';

  const task: Task = {
    id: randomUUID(),
    page_id: pageId,
    created_by: userId,
    // Defaults to the creator. Once a page is shared, this is what makes
    // "my tasks" a filter rather than a schema change (see .docs/sharing).
    assigned_to: userId,
    title: input.title,
    description: input.description ?? null,
    status,
    colour: input.colour ?? nextColour(repo.taskColours(db, pageId)),
    position: appendPosition(db, pageId),
    created_on: createdOn,
    completed_on: status === 'done' ? createdOn : null,
    place_id: input.place_id ?? null,
    location_label: input.location_label ?? null,
    location_lat: input.location_lat ?? null,
    location_lng: input.location_lng ?? null,
    created_at: now,
    updated_at: now,
  };

  const event: StatusEvent = {
    id: randomUUID(),
    task_id: task.id,
    status,
    // The opening event is dated to the task's start, not to now, so a backdated
    // task has a coherent history from the beginning.
    occurred_on: createdOn,
    changed_by: userId,
    created_at: now,
  };

  db.transaction(() => {
    repo.insertTask(db, task);
    repo.insertStatusEvent(db, event);
  })();

  return { ...task, updates: [], status_events: [event], checklist: [] };
}

function firstPageId(db: DB, userId: string): string {
  const pages = repo.listPages(db, userId);
  const first = pages[0];
  if (!first) throw new BadRequest('no pages exist; create one first');
  return first.id;
}

/** New tasks go to the bottom: the list is worked top-down, so the oldest
 *  incomplete task stays on top and new work queues behind it (DD-18). */
function appendPosition(db: DB, pageId: string): string {
  const positions = repo.taskPositions(db, pageId);
  const last = positions[positions.length - 1];
  return between(last ? last.position : null, null);
}

/* ------------------------------------------------------------- updating --- */

export function updateTask(
  db: DB,
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
): TaskWithChildren {
  const existing = repo.getTask(db, userId, taskId);
  if (!existing) throw new NotFound('task not found');

  if (input.page_id && input.page_id !== existing.page_id) {
    if (!repo.getPage(db, userId, input.page_id)) throw new NotFound('target page not found');
  }

  const fields: Record<string, unknown> = { ...input };

  // Moving to another page needs a position valid in that page's ordering.
  if (input.page_id && input.page_id !== existing.page_id) {
    fields.position = appendPosition(db, input.page_id);
  }

  repo.updateTask(db, taskId, fields, new Date().toISOString());
  return getTaskWithChildren(db, userId, taskId)!;
}

/**
 * Change status, writing both the denormalised column and a dated event.
 *
 * `done` sets `completed_on`, which terminates the task's timeline line; moving
 * away from `done` clears it. The event date defaults to today but is editable,
 * so a status change can be backdated like everything else.
 */
export function changeStatus(
  db: DB,
  userId: string,
  taskId: string,
  input: ChangeStatusInput,
): TaskWithChildren {
  const task = repo.getTask(db, userId, taskId);
  if (!task) throw new NotFound('task not found');

  const now = new Date().toISOString();
  const occurredOn = input.occurred_on ?? today();

  db.transaction(() => {
    repo.updateTask(
      db,
      taskId,
      {
        status: input.status,
        completed_on: input.status === 'done' ? occurredOn : null,
      },
      now,
    );
    repo.insertStatusEvent(db, {
      id: randomUUID(),
      task_id: taskId,
      status: input.status,
      occurred_on: occurredOn,
      changed_by: userId,
      created_at: now,
    });
  })();

  return getTaskWithChildren(db, userId, taskId)!;
}

/* ------------------------------------------------------------ reorder --- */

/**
 * Reposition a task between two neighbours, identified by id rather than index,
 * so a concurrent change elsewhere cannot silently misplace it (DD-6).
 */
export function repositionTask(
  db: DB,
  userId: string,
  taskId: string,
  input: { before_id?: string | null; after_id?: string | null; page_id?: string },
): Task {
  const task = repo.getTask(db, userId, taskId);
  if (!task) throw new NotFound('task not found');

  const targetPageId = input.page_id ?? task.page_id;
  if (targetPageId !== task.page_id && !repo.getPage(db, userId, targetPageId)) {
    throw new NotFound('target page not found');
  }

  const siblings = repo
    .taskPositions(db, targetPageId)
    .filter((row) => row.id !== taskId);

  const beforePos = input.before_id
    ? siblings.find((s) => s.id === input.before_id)?.position ?? null
    : null;
  const afterPos = input.after_id
    ? siblings.find((s) => s.id === input.after_id)?.position ?? null
    : null;

  if (input.before_id && beforePos === null) throw new BadRequest('before_id not on this page');
  if (input.after_id && afterPos === null) throw new BadRequest('after_id not on this page');

  const now = new Date().toISOString();
  let position: string;

  if (beforePos === null && afterPos === null) {
    // No neighbours given: append.
    const last = siblings[siblings.length - 1];
    position = between(last ? last.position : null, null);
  } else {
    position = between(beforePos, afterPos);
  }

  db.transaction(() => {
    repo.updateTask(db, taskId, { position, page_id: targetPageId }, now);

    // Keys lengthen with repeated insertion at one point; renumber the page when
    // any grows past the threshold. Rare, and cheap when it happens.
    const after = repo.taskPositions(db, targetPageId);
    if (needsRebalance(after.map((r) => r.position))) {
      const fresh = rebalance(after.length);
      after.forEach((row, i) => repo.updateTask(db, row.id, { position: fresh[i]! }, now));
    }
  })();

  return repo.getTask(db, userId, taskId)!;
}

/* ------------------------------------------------------------- deleting --- */

export function deleteTask(db: DB, userId: string, taskId: string): void {
  const task = repo.getTask(db, userId, taskId);
  if (!task) throw new NotFound('task not found');
  repo.softDeleteTask(db, taskId, new Date().toISOString());
}

/** Undo a delete. Soft deletion means the original id and every child row come
 *  back, which is why it is preferable to delete-and-reinsert (DD-7). */
export function restoreTask(db: DB, userId: string, taskId: string): TaskWithChildren {
  const task = repo.getDeletedTask(db, userId, taskId);
  if (!task) throw new NotFound('deleted task not found');
  repo.restoreTask(db, taskId, new Date().toISOString());
  return getTaskWithChildren(db, userId, taskId)!;
}

/* -------------------------------------------------------------- updates --- */

/**
 * Add a status update, optionally carrying a status change.
 *
 * A note and a state change are separate rows because they are different facts,
 * but they are entered together — so this writes both in one transaction and the
 * UI needs only one interaction (DD-16).
 */
export function addUpdate(
  db: DB,
  userId: string,
  taskId: string,
  input: CreateUpdateInput,
): { update: StatusUpdate; task: TaskWithChildren } {
  const task = repo.getTask(db, userId, taskId);
  if (!task) throw new NotFound('task not found');

  const now = new Date().toISOString();
  const occurredOn = input.occurred_on ?? today();

  const update: StatusUpdate = {
    id: randomUUID(),
    task_id: taskId,
    body: input.body,
    occurred_on: occurredOn,
    created_by: userId,
    created_at: now,
  };

  db.transaction(() => {
    repo.insertUpdate(db, update);

    if (input.status && input.status !== task.status) {
      repo.updateTask(
        db,
        taskId,
        {
          status: input.status,
          completed_on: input.status === 'done' ? occurredOn : null,
        },
        now,
      );
      repo.insertStatusEvent(db, {
        id: randomUUID(),
        task_id: taskId,
        status: input.status,
        occurred_on: occurredOn,
        changed_by: userId,
        created_at: now,
      });
    }
  })();

  return { update, task: getTaskWithChildren(db, userId, taskId)! };
}

export function editUpdate(
  db: DB,
  userId: string,
  updateId: string,
  input: { body?: string; occurred_on?: string },
): StatusUpdate {
  if (!repo.getUpdate(db, userId, updateId)) throw new NotFound('update not found');
  repo.editUpdate(db, updateId, input);
  return repo.getUpdate(db, userId, updateId)!;
}

export function deleteUpdate(db: DB, userId: string, updateId: string): void {
  if (!repo.getUpdate(db, userId, updateId)) throw new NotFound('update not found');
  repo.softDeleteUpdate(db, updateId, new Date().toISOString());
}

export function restoreUpdate(db: DB, userId: string, updateId: string): StatusUpdate {
  if (!repo.getDeletedUpdate(db, userId, updateId)) throw new NotFound('deleted update not found');
  repo.restoreUpdate(db, updateId);
  return repo.getUpdate(db, userId, updateId)!;
}

export function editStatusEvent(
  db: DB,
  userId: string,
  eventId: string,
  occurredOn: string,
): StatusEvent {
  const event = repo.getStatusEvent(db, userId, eventId);
  if (!event) throw new NotFound('status event not found');

  db.transaction(() => {
    repo.editStatusEvent(db, eventId, occurredOn);

    // `completed_on` mirrors the date of the event that made the task done, so
    // correcting that event's date must move it too — otherwise the timeline
    // line ends in the wrong place.
    //
    // Note this cannot just read the chronologically last event: events are
    // ordered by occurred_on, and a backdated event legitimately sorts before
    // the task's opening one. The task's own `status` column is the authority
    // on what the task currently is (DD-15); the events say when it got there.
    const task = repo.getTask(db, userId, event.task_id);
    if (task?.status === 'done') {
      const events = repo.listStatusEvents(db, [event.task_id]);
      const lastDone = [...events].reverse().find((e) => e.status === 'done');
      if (lastDone) {
        repo.updateTask(
          db,
          event.task_id,
          { completed_on: lastDone.occurred_on },
          new Date().toISOString(),
        );
      }
    }
  })();

  return repo.getStatusEvent(db, userId, eventId)!;
}
