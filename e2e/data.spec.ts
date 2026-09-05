import { createTask, expect, ready, test } from './fixtures.js';
import { EXPORT_FORMAT } from '@kram/shared';

test.describe('export and import (FR-11)', () => {
  test('exports the whole dataset as a downloadable file', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Exportable' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-settings').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-button').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^kram-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('round-trips data through export and import', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Round trip me', created_on: '2026-08-12' });

    const doc = await (await request.get('/api/export')).json();
    expect(doc.format).toBe(EXPORT_FORMAT);
    expect(doc.tasks).toHaveLength(1);

    // Wipe, then restore from the file.
    await request.post('/api/import?mode=replace', {
      data: { ...doc, tasks: [] },
    });
    let tasks = await (await request.get('/api/tasks')).json();
    expect(tasks).toHaveLength(0);

    await request.post('/api/import?mode=merge', { data: doc });
    tasks = await (await request.get('/api/tasks')).json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Round trip me');
    expect(tasks[0].created_on).toBe('2026-08-12');
  });

  test('a malformed file changes nothing (FR-11.3)', async ({ request, seeded }) => {
    await createTask(request, { title: 'Precious' });
    const before = await (await request.get('/api/tasks')).json();

    const response = await request.post('/api/import?mode=replace', {
      data: { format: 'wrong', version: 1 },
    });
    expect(response.status()).toBe(400);

    const after = await (await request.get('/api/tasks')).json();
    expect(after).toHaveLength(before.length);
  });
});
