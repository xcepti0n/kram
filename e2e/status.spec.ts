import { createTask, expect, ready, test } from './fixtures.js';

test.describe('status and updates (FR-3, FR-4)', () => {
  test('changes status from the row chip, recording an event', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Blocked task' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    await page.getByTestId('task-row-Blocked task').getByTestId('status-chip').click();
    await page.getByTestId('status-option-blocked').click();

    await expect(
      page.getByTestId('task-row-Blocked task').getByTestId('status-chip'),
    ).toContainText('Blocked');

    const tasks = await (await page.request.get('/api/tasks?page_id=e2e-page')).json();
    expect(tasks[0].status).toBe('blocked');
  });

  test('adds an update and a status change in one action (DD-16)', async ({
    page,
    request,
    seeded,
  }) => {
    const task = await createTask(request, { title: 'Needs an update' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Needs an update').click();

    await page.getByTestId('update-composer').fill('Blocked on the API key');
    await page.getByTestId('update-status-select').selectOption('blocked');
    await page.getByTestId('update-submit').click();

    await expect(page.getByTestId('task-history')).toContainText('Blocked on the API key');

    const detail = await (await page.request.get(`/api/tasks/${task.id}`)).json();
    expect(detail.status).toBe('blocked');
    expect(detail.updates).toHaveLength(1);
    // Two rows, one interaction: the note and the state change.
    expect(detail.status_events).toHaveLength(2);
  });

  test('adds an update with Enter alone (FR-3.4)', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'Quick note' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Quick note').click();

    await page.getByTestId('update-composer').fill('Added frontend with theme');
    await page.getByTestId('update-composer').press('Enter');

    await expect(page.getByTestId('task-history')).toContainText('Added frontend with theme');
    const detail = await (await page.request.get(`/api/tasks/${task.id}`)).json();
    expect(detail.updates).toHaveLength(1);
  });

  test('deletes an update with undo', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'With updates' });
    await request.post(`/api/tasks/${task.id}/updates`, { data: { body: 'Some progress' } });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-With updates').click();

    await page.getByTestId('delete-update').click();
    await expect(page.getByTestId('toast-region')).toContainText('Update deleted');
    await page.getByTestId('toast-region').getByRole('button', { name: 'Undo' }).click();

    await expect(page.getByTestId('task-history')).toContainText('Some progress');
  });
});
