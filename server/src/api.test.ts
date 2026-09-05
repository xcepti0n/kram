/**
 * API-level tests against a real Fastify instance and a real in-memory database.
 * These cover the service and repository layers through the routes, which is the
 * shape most likely to catch a regression in how the pieces fit together.
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { today } from '@tasktracker/shared';

let server: FastifyInstance;
let pageId: string;

/** Call a route and hand back a typed body. Tests assert on shape, so the
 *  caller names the type it expects rather than casting at every use site. */
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
  return {
    status: res.statusCode,
    body: (res.body ? JSON.parse(res.body) : null) as T,
  };
}

beforeEach(async () => {
  const app = await buildApp({ databaseFile: ':memory:', dataDir: '/tmp', logger: false });
  server = app.server;
  const pages = await call('GET', '/api/pages');
  pageId = (pages.body as { id: string }[])[0]!.id;
});

afterEach(async () => {
  await server.close();
});

describe('seeding', () => {
  it('creates one user, one page and its membership row', async () => {
    const pages = await call('GET', '/api/pages');
    expect((pages.body as unknown[]).length).toBe(1);
    const doc = (await call('GET', '/api/export')).body as {
      users: unknown[];
      pages: { members: string[] }[];
    };
    expect(doc.users.length).toBe(1);
    expect(doc.pages[0]!.members.length).toBe(1);
  });
});

describe('task creation (FR-1, FR-2)', () => {
  it('creates from a title alone, applying every default', async () => {
    const res = await call('POST', '/api/tasks', { title: 'Build task tracker' });
    expect(res.status).toBe(201);
    const task = res.body as Record<string, unknown>;
    expect(task.title).toBe('Build task tracker');
    expect(task.status).toBe('todo');
    expect(task.created_on).toBe(today());
    expect(task.page_id).toBe(pageId);
    expect(task.colour).toMatch(/^#[0-9a-f]{6}$/i);
    expect(task.completed_on).toBeNull();
  });

  it('defaults assigned_to to the creator, so sharing later is a filter', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as Record<string, string>;
    expect(task.assigned_to).toBe(task.created_by);
  });

  it('writes an opening status event dated to the task start', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X', created_on: '2026-08-12' }))
      .body as { status_events: { status: string; occurred_on: string }[] };
    expect(task.status_events).toHaveLength(1);
    expect(task.status_events[0]!.status).toBe('todo');
    expect(task.status_events[0]!.occurred_on).toBe('2026-08-12');
  });

  it('accepts past and future creation dates (FR-2.2, FR-2.3)', async () => {
    const past = (await call('POST', '/api/tasks', { title: 'Past', created_on: '2020-01-01' }))
      .body as { created_on: string };
    expect(past.created_on).toBe('2020-01-01');
    const future = (await call('POST', '/api/tasks', { title: 'Future', created_on: '2030-12-31' }))
      .body as { created_on: string };
    expect(future.created_on).toBe('2030-12-31');
  });

  it('rejects an empty title', async () => {
    expect((await call('POST', '/api/tasks', { title: '' })).status).toBe(400);
  });

  it('appends new tasks to the bottom (DD-18)', async () => {
    await call('POST', '/api/tasks', { title: 'First' });
    await call('POST', '/api/tasks', { title: 'Second' });
    await call('POST', '/api/tasks', { title: 'Third' });
    const list = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as { title: string }[];
    expect(list.map((t) => t.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('gives each task a distinct colour (FR-5.5)', async () => {
    const colours = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const t = (await call('POST', '/api/tasks', { title: `T${i}` })).body as { colour: string };
      colours.add(t.colour);
    }
    expect(colours.size).toBe(6);
  });
});

describe('status (FR-4, DD-15)', () => {
  it('moves through the lifecycle, recording an event each time', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    await call('PATCH', `/api/tasks/${task.id}/status`, { status: 'in_progress' });
    await call('PATCH', `/api/tasks/${task.id}/status`, { status: 'blocked' });
    const final = (await call('PATCH', `/api/tasks/${task.id}/status`, { status: 'done' }))
      .body as { status: string; status_events: unknown[] };
    expect(final.status).toBe('done');
    expect(final.status_events).toHaveLength(4); // todo + three transitions
  });

  it('sets completed_on when done and clears it when reopened (FR-4.4)', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    const done = (await call('PATCH', `/api/tasks/${task.id}/status`, {
      status: 'done',
      occurred_on: '2026-09-01',
    })).body as { completed_on: string | null };
    expect(done.completed_on).toBe('2026-09-01');

    const reopened = (await call('PATCH', `/api/tasks/${task.id}/status`, {
      status: 'in_progress',
    })).body as { completed_on: string | null };
    expect(reopened.completed_on).toBeNull();
  });

  it('accepts a backdated status change', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    const res = (await call('PATCH', `/api/tasks/${task.id}/status`, {
      status: 'blocked',
      occurred_on: '2026-08-19',
    })).body as { status_events: { status: string; occurred_on: string }[] };
    const blocked = res.status_events.find((e) => e.status === 'blocked');
    expect(blocked?.occurred_on).toBe('2026-08-19');
  });

  it('rejects an unknown status', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    expect((await call('PATCH', `/api/tasks/${task.id}/status`, { status: 'nope' })).status).toBe(400);
  });

  it('corrects completed_on when the done event date is edited', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    const done = (await call('PATCH', `/api/tasks/${task.id}/status`, {
      status: 'done',
      occurred_on: '2026-09-01',
    })).body as { status_events: { id: string; status: string }[] };
    const event = done.status_events.find((e) => e.status === 'done')!;

    await call('PATCH', `/api/status-events/${event.id}`, { occurred_on: '2026-08-28' });
    const after = (await call('GET', `/api/tasks/${task.id}`)).body as { completed_on: string };
    expect(after.completed_on).toBe('2026-08-28');
  });
});

describe('status updates (FR-3, DD-16)', () => {
  it('adds an update dated today by default', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    const res = await call('POST', `/api/tasks/${task.id}/updates`, {
      body: 'Added frontend with theme',
    });
    expect(res.status).toBe(201);
    const { update } = res.body as { update: { body: string; occurred_on: string } };
    expect(update.body).toBe('Added frontend with theme');
    expect(update.occurred_on).toBe(today());
  });

  it('accepts a backdated update', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    const { update } = (await call('POST', `/api/tasks/${task.id}/updates`, {
      body: 'Added backend',
      occurred_on: '2026-08-19',
    })).body as { update: { occurred_on: string } };
    expect(update.occurred_on).toBe('2026-08-19');
  });

  it('changes status alongside an update, in one interaction', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    const res = (await call('POST', `/api/tasks/${task.id}/updates`, {
      body: 'Blocked on the API key',
      occurred_on: '2026-08-19',
      status: 'blocked',
    })).body as {
      task: { status: string; status_events: { status: string; occurred_on: string }[] };
    };
    expect(res.task.status).toBe('blocked');
    const event = res.task.status_events.find((e) => e.status === 'blocked');
    expect(event?.occurred_on).toBe('2026-08-19');
  });

  it('edits and deletes an update (FR-3.3)', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    const { update } = (await call('POST', `/api/tasks/${task.id}/updates`, { body: 'One' }))
      .body as { update: { id: string } };

    const edited = (await call('PATCH', `/api/updates/${update.id}`, {
      body: 'Two',
      occurred_on: '2026-08-01',
    })).body as { body: string; occurred_on: string };
    expect(edited.body).toBe('Two');
    expect(edited.occurred_on).toBe('2026-08-01');

    expect((await call('DELETE', `/api/updates/${update.id}`)).status).toBe(204);
    const after = (await call('GET', `/api/tasks/${task.id}`)).body as { updates: unknown[] };
    expect(after.updates).toHaveLength(0);
  });

  it('restores a deleted update (FR-10.5)', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    const { update } = (await call('POST', `/api/tasks/${task.id}/updates`, { body: 'One' }))
      .body as { update: { id: string } };
    await call('DELETE', `/api/updates/${update.id}`);
    expect((await call('POST', `/api/updates/${update.id}/restore`)).status).toBe(200);
    const after = (await call('GET', `/api/tasks/${task.id}`)).body as { updates: unknown[] };
    expect(after.updates).toHaveLength(1);
  });
});

describe('deletion and undo (FR-10.5, DD-7)', () => {
  it('soft-deletes a task and restores it with its children intact', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    await call('POST', `/api/tasks/${task.id}/updates`, { body: 'A note' });

    expect((await call('DELETE', `/api/tasks/${task.id}`)).status).toBe(204);
    expect((await call('GET', `/api/tasks/${task.id}`)).status).toBe(404);

    const restored = (await call('POST', `/api/tasks/${task.id}/restore`)).body as {
      id: string;
      updates: unknown[];
      status_events: unknown[];
    };
    // The original id survives, which is why soft delete beats delete-and-reinsert.
    expect(restored.id).toBe(task.id);
    expect(restored.updates).toHaveLength(1);
    expect(restored.status_events).toHaveLength(1);
  });
});

describe('sorting (FR-7.5, DD-17)', () => {
  it('sorts by title, status and creation date without losing manual order', async () => {
    const b = (await call('POST', '/api/tasks', { title: 'Beta', created_on: '2026-08-02' }))
      .body as { id: string };
    const a = (await call('POST', '/api/tasks', { title: 'Alpha', created_on: '2026-08-01' }))
      .body as { id: string };
    await call('PATCH', `/api/tasks/${a.id}/status`, { status: 'blocked' });

    const manual = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as { id: string }[];
    expect(manual.map((t) => t.id)).toEqual([b.id, a.id]);

    const byTitle = (await call('GET', `/api/tasks?page_id=${pageId}&sort=title`)).body as
      { title: string }[];
    expect(byTitle.map((t) => t.title)).toEqual(['Alpha', 'Beta']);

    const byStatus = (await call('GET', `/api/tasks?page_id=${pageId}&sort=status`)).body as
      { id: string }[];
    expect(byStatus[0]!.id).toBe(a.id); // blocked first — what needs attention

    const byCreated = (await call('GET', `/api/tasks?page_id=${pageId}&sort=created`)).body as
      { id: string }[];
    expect(byCreated[0]!.id).toBe(a.id);

    // Manual order is the stored truth and survives every other sort.
    const again = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as { id: string }[];
    expect(again.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it('filters out done tasks when asked (FR-4.5)', async () => {
    const t = (await call('POST', '/api/tasks', { title: 'Done one' })).body as { id: string };
    await call('POST', '/api/tasks', { title: 'Open one' });
    await call('PATCH', `/api/tasks/${t.id}/status`, { status: 'done' });

    const all = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as unknown[];
    expect(all).toHaveLength(2);
    const open = (await call('GET', `/api/tasks?page_id=${pageId}&include_done=false`))
      .body as unknown[];
    expect(open).toHaveLength(1);
  });
});

describe('ordering (FR-7, DD-6)', () => {
  it('reorders by neighbour ids and persists', async () => {
    const a = (await call('POST', '/api/tasks', { title: 'A' })).body as { id: string };
    const b = (await call('POST', '/api/tasks', { title: 'B' })).body as { id: string };
    const c = (await call('POST', '/api/tasks', { title: 'C' })).body as { id: string };

    // Move C between A and B.
    await call('PATCH', `/api/tasks/${c.id}/position`, { before_id: a.id, after_id: b.id });
    const list = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as { id: string }[];
    expect(list.map((t) => t.id)).toEqual([a.id, c.id, b.id]);
  });

  it('moves a task to the top', async () => {
    await call('POST', '/api/tasks', { title: 'A' });
    const b = (await call('POST', '/api/tasks', { title: 'B' })).body as { id: string };
    const list0 = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as { id: string }[];
    await call('PATCH', `/api/tasks/${b.id}/position`, { after_id: list0[0]!.id });
    const list = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as { id: string }[];
    expect(list[0]!.id).toBe(b.id);
  });

  it('moves a task to another page in one write', async () => {
    const other = (await call('POST', '/api/pages', { name: 'Other' })).body as { id: string };
    const task = (await call('POST', '/api/tasks', { title: 'Movable' })).body as { id: string };

    await call('PATCH', `/api/tasks/${task.id}/position`, { page_id: other.id });
    const onOther = (await call('GET', `/api/tasks?page_id=${other.id}`)).body as { id: string }[];
    expect(onOther.map((t) => t.id)).toEqual([task.id]);
  });

  it('survives many reorderings at the same point', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(((await call('POST', '/api/tasks', { title: `T${i}` })).body as { id: string }).id);
    }
    // Repeatedly drop the last task into the same gap — the pathological case
    // for key growth, which the rebalance path must absorb.
    for (let i = 0; i < 40; i += 1) {
      const list = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as { id: string }[];
      const last = list[list.length - 1]!;
      await call('PATCH', `/api/tasks/${last.id}/position`, {
        before_id: list[0]!.id,
        after_id: list[1]!.id,
      });
    }
    const final = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as
      { id: string; position: string }[];
    expect(final).toHaveLength(5);
    expect(new Set(final.map((t) => t.position)).size).toBe(5);
    const positions = final.map((t) => t.position);
    expect([...positions].sort()).toEqual(positions);
  });
});

describe('pages (FR-6)', () => {
  it('creates, renames and reorders pages', async () => {
    const p = (await call('POST', '/api/pages', { name: 'Home Server' })).body as { id: string };
    const renamed = (await call('PATCH', `/api/pages/${p.id}`, { name: 'Infra' })).body as
      { name: string };
    expect(renamed.name).toBe('Infra');

    const pages = (await call('GET', '/api/pages')).body as { id: string }[];
    await call('PATCH', `/api/pages/${p.id}/position`, { after_id: pages[0]!.id });
    const reordered = (await call('GET', '/api/pages')).body as { id: string }[];
    expect(reordered[0]!.id).toBe(p.id);
  });

  it('refuses to delete a page without saying what happens to its tasks (FR-6.3)', async () => {
    const p = (await call('POST', '/api/pages', { name: 'Temp' })).body as { id: string };
    const res = await call('DELETE', `/api/pages/${p.id}`);
    expect(res.status).toBe(400);
    expect((await call('GET', '/api/pages')).body as unknown[]).toHaveLength(2);
  });

  it('moves tasks to another page on delete', async () => {
    const p = (await call('POST', '/api/pages', { name: 'Temp' })).body as { id: string };
    await call('POST', '/api/tasks', { title: 'Keep me', page_id: p.id });

    const res = await call('DELETE', `/api/pages/${p.id}?tasks=move&to=${pageId}`);
    expect(res.status).toBe(200);
    const moved = (await call('GET', `/api/tasks?page_id=${pageId}`)).body as { title: string }[];
    expect(moved.map((t) => t.title)).toContain('Keep me');
  });

  it('soft-deletes tasks on delete, keeping the operation undoable', async () => {
    const p = (await call('POST', '/api/pages', { name: 'Temp' })).body as { id: string };
    const task = (await call('POST', '/api/tasks', { title: 'Bye', page_id: p.id })).body as
      { id: string };

    await call('DELETE', `/api/pages/${p.id}?tasks=delete`);
    expect((await call('GET', `/api/tasks/${task.id}`)).status).toBe(404);
    expect((await call('POST', `/api/tasks/${task.id}/restore`)).status).toBe(200);
  });

  it('refuses to delete the only page', async () => {
    const res = await call('DELETE', `/api/pages/${pageId}?tasks=delete`);
    expect(res.status).toBe(400);
  });
});

describe('timeline (FR-5)', () => {
  it('returns tasks with their events and updates in one request', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'Build', created_on: '2026-08-12' }))
      .body as { id: string };
    await call('POST', `/api/tasks/${task.id}/updates`, {
      body: 'Added backend',
      occurred_on: '2026-08-19',
      status: 'in_progress',
    });

    const tl = (await call('GET', '/api/timeline?from=2026-08-01&to=2026-09-30')).body as {
      range: { from: string; to: string };
      pages: unknown[];
      tasks: { updates: unknown[]; status_events: unknown[] }[];
    };
    expect(tl.range.from).toBe('2026-08-01');
    expect(tl.tasks).toHaveLength(1);
    expect(tl.tasks[0]!.updates).toHaveLength(1);
    expect(tl.tasks[0]!.status_events).toHaveLength(2);
    expect(tl.pages.length).toBeGreaterThan(0);
  });

  it('includes a task whose span crosses the range but starts before it', async () => {
    await call('POST', '/api/tasks', { title: 'Long runner', created_on: '2026-01-01' });
    const tl = (await call('GET', '/api/timeline?from=2026-08-01&to=2026-08-02')).body as {
      tasks: unknown[];
    };
    // Intersection, not containment: an open task started in January is still
    // running in August and must render, clipped at the viewport edge.
    expect(tl.tasks).toHaveLength(1);
  });

  it('excludes a task that finished before the range', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'Old', created_on: '2026-01-01' }))
      .body as { id: string };
    await call('PATCH', `/api/tasks/${task.id}/status`, {
      status: 'done',
      occurred_on: '2026-02-01',
    });
    const tl = (await call('GET', '/api/timeline?from=2026-08-01&to=2026-08-30')).body as {
      tasks: unknown[];
    };
    expect(tl.tasks).toHaveLength(0);
  });

  it('filters to selected pages', async () => {
    const other = (await call('POST', '/api/pages', { name: 'Other' })).body as { id: string };
    await call('POST', '/api/tasks', { title: 'Here' });
    await call('POST', '/api/tasks', { title: 'There', page_id: other.id });

    const tl = (await call('GET', `/api/timeline?page_ids=${other.id}`)).body as {
      tasks: { title: string }[];
    };
    expect(tl.tasks.map((t) => t.title)).toEqual(['There']);
  });
});

describe('export and import (FR-11, DD-14)', () => {
  it('round-trips through replace without loss', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'Build', created_on: '2026-08-12' }))
      .body as { id: string };
    await call('POST', `/api/tasks/${task.id}/updates`, { body: 'A note', status: 'in_progress' });

    const before = (await call('GET', '/api/export')).body as Record<string, unknown[]>;
    const res = await call('POST', '/api/import?mode=replace', before);
    expect(res.status).toBe(200);

    const after = (await call('GET', '/api/export')).body as Record<string, unknown[]>;
    expect(after.tasks).toHaveLength(before.tasks!.length);
    expect(after.pages).toHaveLength(before.pages!.length);
    expect((after.tasks![0] as { id: string }).id).toBe((before.tasks![0] as { id: string }).id);
  });

  it('nests children inside their task, for a human reader', async () => {
    const task = (await call('POST', '/api/tasks', { title: 'X' })).body as { id: string };
    await call('POST', `/api/tasks/${task.id}/updates`, { body: 'A note' });
    const doc = (await call('GET', '/api/export')).body as {
      tasks: { updates: unknown[]; status_events: unknown[] }[];
    };
    expect(doc.tasks[0]!.updates).toHaveLength(1);
    expect(doc.tasks[0]!.status_events).toHaveLength(1);
  });

  it('skips existing ids in merge mode', async () => {
    await call('POST', '/api/tasks', { title: 'X' });
    const doc = (await call('GET', '/api/export')).body as Record<string, unknown[]>;
    const res = (await call('POST', '/api/import?mode=merge', doc)).body as { tasks: number };
    expect(res.tasks).toBe(0);
    const after = (await call('GET', '/api/export')).body as Record<string, unknown[]>;
    expect(after.tasks).toHaveLength(1);
  });

  it('creates fresh ids in duplicate mode, leaving existing data alone', async () => {
    await call('POST', '/api/tasks', { title: 'X' });
    const doc = (await call('GET', '/api/export')).body as Record<string, unknown[]>;
    await call('POST', '/api/import?mode=duplicate', doc);
    const after = (await call('GET', '/api/export')).body as { tasks: { id: string }[] };
    expect(after.tasks).toHaveLength(2);
    expect(new Set(after.tasks.map((t) => t.id)).size).toBe(2);
  });

  it('writes nothing when the document is malformed (FR-11.3)', async () => {
    await call('POST', '/api/tasks', { title: 'Precious' });
    const before = (await call('GET', '/api/export')).body as Record<string, unknown[]>;

    const res = await call('POST', '/api/import?mode=replace', { format: 'wrong', version: 1 });
    expect(res.status).toBe(400);

    const after = (await call('GET', '/api/export')).body as Record<string, unknown[]>;
    expect(after.tasks).toHaveLength(before.tasks!.length);
  });

  it('refuses a document from a newer format version', async () => {
    const doc = (await call('GET', '/api/export')).body as Record<string, unknown>;
    const res = await call('POST', '/api/import?mode=merge', { ...doc, version: 99 });
    expect(res.status).toBe(400);
  });
});

describe('settings (FR-9.4)', () => {
  it('returns defaults and persists changes', async () => {
    const initial = (await call('GET', '/api/settings')).body as Record<string, unknown>;
    expect(initial.theme).toBe('calm');
    expect(initial.mode).toBe('system');
    expect(initial.density).toBe('comfortable');

    await call('PATCH', '/api/settings', { theme: 'dense', mode: 'dark', hide_done: true });
    const after = (await call('GET', '/api/settings')).body as Record<string, unknown>;
    expect(after.theme).toBe('dense');
    expect(after.mode).toBe('dark');
    expect(after.hide_done).toBe(true);
  });

  it('rejects an unknown theme', async () => {
    expect((await call('PATCH', '/api/settings', { theme: 'neon' })).status).toBe(400);
  });
});
