/**
 * Timeline assembly (FR-5).
 *
 * One request returns everything the view needs, avoiding an N+1 of per-task
 * update fetches. Tasks are included when their span intersects the requested
 * range, so a task that started before `from` still renders with its line
 * clipped at the viewport edge rather than disappearing.
 */
import { addDays, today, type TimelineResponse, type TimelineTask } from '@tasktracker/shared';
import type { DB } from '../db/index.js';
import * as repo from '../repositories/index.js';

export interface TimelineQuery {
  from?: string;
  to?: string;
  pageIds?: string[];
  includeDone?: boolean;
  assignedTo?: string;
}

export function buildTimeline(db: DB, userId: string, query: TimelineQuery): TimelineResponse {
  const to = query.to ?? today();
  const from = query.from ?? addDays(to, -60);

  const pages = repo.listPages(db, userId);
  const visiblePages = query.pageIds?.length
    ? pages.filter((p) => query.pageIds!.includes(p.id))
    : pages;
  const visibleIds = new Set(visiblePages.map((p) => p.id));

  const tasks = repo
    .listTasks(db, userId, {
      includeDone: query.includeDone,
      assignedTo: query.assignedTo,
    })
    .filter((t) => visibleIds.has(t.page_id));

  const ids = tasks.map((t) => t.id);
  const updates = repo.listUpdates(db, ids);
  const events = repo.listStatusEvents(db, ids);

  const updatesByTask = new Map<string, typeof updates>();
  for (const u of updates) {
    const list = updatesByTask.get(u.task_id) ?? [];
    list.push(u);
    updatesByTask.set(u.task_id, list);
  }

  const eventsByTask = new Map<string, typeof events>();
  for (const e of events) {
    const list = eventsByTask.get(e.task_id) ?? [];
    list.push(e);
    eventsByTask.set(e.task_id, list);
  }

  const timelineTasks: TimelineTask[] = [];

  for (const task of tasks) {
    const taskUpdates = updatesByTask.get(task.id) ?? [];
    const taskEvents = eventsByTask.get(task.id) ?? [];

    // An update may predate the task's created_on — the design allows recording
    // reality over enforcing a rule the user did not ask for, so the span starts
    // at the earliest of everything known about the task.
    const earliest = [
      task.created_on,
      ...taskUpdates.map((u) => u.occurred_on),
      ...taskEvents.map((e) => e.occurred_on),
    ].reduce((a, b) => (a <= b ? a : b));

    const latest = task.completed_on ?? today();

    // Intersection, not containment: a task spanning the whole viewport has
    // neither endpoint inside it but is very much visible.
    if (latest < from || earliest > to) continue;

    timelineTasks.push({
      id: task.id,
      page_id: task.page_id,
      place_id: task.place_id,
      title: task.title,
      colour: task.colour,
      status: task.status,
      created_on: task.created_on,
      completed_on: task.completed_on,
      assigned_to: task.assigned_to,
      status_events: taskEvents.map((e) => ({
        id: e.id,
        status: e.status,
        occurred_on: e.occurred_on,
      })),
      updates: taskUpdates.map((u) => ({
        id: u.id,
        body: u.body,
        occurred_on: u.occurred_on,
      })),
    });
  }

  return {
    range: { from, to },
    pages: visiblePages.map((p) => ({
      id: p.id,
      name: p.name,
      colour: p.colour,
      position: p.position,
    })),
    tasks: timelineTasks,
  };
}
