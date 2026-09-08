/**
 * Checklist items and their day-batched history (DD-36).
 *
 * The CRUD here is ordinary; the batching is not. Ticking eight groceries must
 * leave ONE line in the timeline, and that line has to stay truthful when items
 * are later unticked, renamed or deleted — a counter that only ever increments
 * would drift on every one of those. Most of these tests are about that.
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { today } from '@kram/shared';

let server: FastifyInstance;
let pageId: string;

async function call<T = any>(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await server.inject({
    method: method as 'GET',
    url,
    ...(body === undefined ? {} : { payload: body as object }),
  });
  return { status: res.statusCode, body: (res.body ? JSON.parse(res.body) : null) as T };
}

/** A task with the given items already on its checklist. */
async function taskWithItems(...texts: string[]) {
  const task = (await call('POST', '/api/tasks', { title: 'Buy groceries', page_id: pageId })).body;
  const items = [];
  for (const text of texts) {
    const created = await call('POST', `/api/tasks/${task.id}/checklist`, { text });
    items.push(created.body.item);
  }
  return { task, items };
}

/** The updates a person did not type: the generated day summaries. */
const summaries = (task: any) =>
  (task.updates as { body: string }[]).map((u) => u.body);

beforeEach(async () => {
  const app = await buildApp({ databaseFile: ':memory:', dataDir: '/tmp', logger: false });
  server = app.server;
  const pages = await call('GET', '/api/pages');
  pageId = (pages.body as { id: string }[])[0]!.id;
});

afterEach(async () => {
  await server.close();
});

describe('checklist items', () => {
  it('adds items to a task and returns them in order', async () => {
    const { task } = await taskWithItems('Milk', 'Eggs', 'Bread');

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.checklist.map((i: any) => i.text)).toEqual(['Milk', 'Eggs', 'Bread']);
    expect(fetched.checklist.every((i: any) => i.checked_on === null)).toBe(true);
  });

  it('records the day an item was added', async () => {
    const { items } = await taskWithItems('Milk');
    expect(items[0].added_on).toBe(today());
  });

  it('records the day an item was checked, and clears it on uncheck', async () => {
    const { items } = await taskWithItems('Milk');

    const checked = (await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true })).body;
    expect(checked.item.checked_on).toBe(today());

    const unchecked = (await call('PATCH', `/api/checklist/${items[0].id}`, { checked: false })).body;
    expect(unchecked.item.checked_on).toBeNull();
  });

  it('renames an item without touching its history', async () => {
    const { items } = await taskWithItems('Mlik');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });

    const renamed = (await call('PATCH', `/api/checklist/${items[0].id}`, { text: 'Milk' })).body;
    expect(renamed.item.text).toBe('Milk');
    expect(renamed.item.checked_on).toBe(today());
  });

  it('removes an item from the list', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs');
    await call('DELETE', `/api/checklist/${items[0].id}`);

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.checklist.map((i: any) => i.text)).toEqual(['Eggs']);
  });

  it('reorders an item between two others', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs', 'Bread');

    // Move Bread to the front.
    await call('PATCH', `/api/checklist/${items[2].id}/position`, {
      before_id: null,
      after_id: items[0].id,
    });

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.checklist.map((i: any) => i.text)).toEqual(['Bread', 'Milk', 'Eggs']);
  });

  it('rejects an empty item', async () => {
    const { task } = await taskWithItems();
    expect((await call('POST', `/api/tasks/${task.id}/checklist`, { text: '' })).status).toBe(400);
  });

  it('404s for an item on a task that does not exist', async () => {
    const missing = '00000000-0000-4000-a000-000000000000';
    expect((await call('POST', `/api/tasks/${missing}/checklist`, { text: 'x' })).status).toBe(404);
    expect((await call('PATCH', `/api/checklist/${missing}`, { checked: true })).status).toBe(404);
  });
});

describe('checklist history', () => {
  /* The requirement in one test: a shop is one line, not one per item. */
  it('writes a single update for a day however many items are ticked', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs', 'Bread', 'Butter', 'Jam');

    for (const item of items) {
      await call('PATCH', `/api/checklist/${item.id}`, { checked: true });
    }

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.updates).toHaveLength(1);
  });

  it('names the items while the list is short enough to read', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });
    await call('PATCH', `/api/checklist/${items[1].id}`, { checked: true });

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(summaries(fetched)[0]).toContain('Milk and Eggs');
  });

  it('falls back to a count once there are too many to name', async () => {
    const { task, items } = await taskWithItems('a', 'b', 'c', 'd', 'e', 'f');
    for (const item of items) {
      await call('PATCH', `/api/checklist/${item.id}`, { checked: true });
    }

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(summaries(fetched)[0]).toContain('6 items');
  });

  /* The summary is recomputed from the items, not incremented — this is the
     case that would drift if it were a counter. */
  it('corrects the summary when a tick is undone', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });
    await call('PATCH', `/api/checklist/${items[1].id}`, { checked: true });
    await call('PATCH', `/api/checklist/${items[1].id}`, { checked: false });

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.updates).toHaveLength(1);
    // Eggs is still reported as *added* today — it was. What must not survive
    // is the claim that it was checked off.
    expect(summaries(fetched)[0]).toBe('Checked off Milk, added Eggs.');
  });

  it('follows a rename into the summary', async () => {
    const { task, items } = await taskWithItems('Mlik');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });
    await call('PATCH', `/api/checklist/${items[0].id}`, { text: 'Milk' });

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(summaries(fetched)[0]).toContain('Milk');
    expect(summaries(fetched)[0]).not.toContain('Mlik');
  });

  /* A summary describing nothing is worse than no summary. */
  it('removes the summary when the day\'s only activity is undone', async () => {
    const { task, items } = await taskWithItems('Milk');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });
    expect((await call('GET', `/api/tasks/${task.id}`)).body.updates).toHaveLength(1);

    await call('DELETE', `/api/checklist/${items[0].id}`);
    expect((await call('GET', `/api/tasks/${task.id}`)).body.updates).toHaveLength(0);
  });

  it('reports both what was added and what was checked', async () => {
    const { task, items } = await taskWithItems('Milk');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });
    await call('POST', `/api/tasks/${task.id}/checklist`, { text: 'Eggs' });

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.updates).toHaveLength(1);
    expect(summaries(fetched)[0]).toContain('Milk');
    expect(summaries(fetched)[0]).toContain('Eggs');
  });

  it('says so when the whole list is done', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs');
    for (const item of items) {
      await call('PATCH', `/api/checklist/${item.id}`, { checked: true });
    }

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(summaries(fetched)[0]).toContain('All 2 done');
  });

  /* Typed updates and generated summaries share a table; the batching must not
     touch the former. */
  it('leaves an update the user typed alone', async () => {
    const { task, items } = await taskWithItems('Milk');
    await call('POST', `/api/tasks/${task.id}/updates`, { body: 'Went to the shop' });
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.updates).toHaveLength(2);
    expect(summaries(fetched)).toContain('Went to the shop');
  });

  it('keeps a separate summary per task', async () => {
    const a = await taskWithItems('Milk');
    const b = await taskWithItems('Oil change');
    await call('PATCH', `/api/checklist/${a.items[0].id}`, { checked: true });
    await call('PATCH', `/api/checklist/${b.items[0].id}`, { checked: true });

    expect((await call('GET', `/api/tasks/${a.task.id}`)).body.updates).toHaveLength(1);
    expect((await call('GET', `/api/tasks/${b.task.id}`)).body.updates).toHaveLength(1);
  });
});

describe('resetting a standing list', () => {
  /* Groceries refills every week; a car service is finished once. Reset is what
     serves the first without forcing the second to be recreated. */
  it('clears every tick but keeps the items', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs');
    for (const item of items) {
      await call('PATCH', `/api/checklist/${item.id}`, { checked: true });
    }

    const reset = (await call('POST', `/api/tasks/${task.id}/checklist/reset`)).body;
    expect(reset.task.checklist).toHaveLength(2);
    expect(reset.task.checklist.every((i: any) => i.checked_on === null)).toBe(true);
  });

  it('does not change the task status', async () => {
    const { task, items } = await taskWithItems('Milk');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });

    const reset = (await call('POST', `/api/tasks/${task.id}/checklist/reset`)).body;
    expect(reset.task.status).toBe('todo');
  });
});

describe('the task itself', () => {
  /* Completing a task when its last item is ticked would archive the weekly
     shop every week. The row shows progress instead. */
  it('does not complete the task when the last item is checked', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs');
    for (const item of items) {
      await call('PATCH', `/api/checklist/${item.id}`, { checked: true });
    }

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.status).toBe('todo');
    expect(fetched.completed_on).toBeNull();
  });

  it('deletes the items with the task', async () => {
    const { task, items } = await taskWithItems('Milk');
    await call('DELETE', `/api/tasks/${task.id}`);
    expect((await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true })).status).toBe(404);
  });
});

describe('backup and restore', () => {
  /* A new table the transfer layer does not know about is silent data loss:
     the export succeeds, the restore succeeds, and the lists are simply gone. */
  it('carries checklist items and their history through an export/import cycle', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs', 'Bread');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });

    const doc = (await call('GET', '/api/export')).body;
    const restored = await call('POST', '/api/import?mode=replace', doc);
    expect(restored.status).toBe(200);
    expect(restored.body.checklist_items).toBe(3);

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.checklist.map((i: any) => i.text)).toEqual(['Milk', 'Eggs', 'Bread']);
    expect(fetched.checklist[0].checked_on).toBe(today());
    expect(fetched.checklist[1].checked_on).toBeNull();
  });

  /* The day summary has to stay recognised as one after a restore. If
     checklist_day were dropped, the next tick would try to write a second
     summary for the same day and hit the partial unique index. */
  it('keeps ticking the same day working after a restore', async () => {
    const { task, items } = await taskWithItems('Milk', 'Eggs');
    await call('PATCH', `/api/checklist/${items[0].id}`, { checked: true });

    const doc = (await call('GET', '/api/export')).body;
    await call('POST', '/api/import?mode=replace', doc);

    const after = (await call('GET', `/api/tasks/${task.id}`)).body;
    const eggs = after.checklist.find((i: any) => i.text === 'Eggs');
    const ticked = await call('PATCH', `/api/checklist/${eggs.id}`, { checked: true });
    expect(ticked.status).toBe(200);

    const fetched = (await call('GET', `/api/tasks/${task.id}`)).body;
    expect(fetched.updates).toHaveLength(1);
    expect(summaries(fetched)[0]).toContain('Milk and Eggs');
  });

  /* Backups written before checklists existed must still import. */
  it('imports a document with no checklist field', async () => {
    const doc = (await call('GET', '/api/export')).body;
    for (const task of doc.tasks) delete task.checklist;

    const restored = await call('POST', '/api/import?mode=replace', doc);
    expect(restored.status).toBe(200);
    expect(restored.body.checklist_items).toBe(0);
  });
});
