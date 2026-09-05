import { createTask, expect, ready, test } from './fixtures.js';

test.describe('pages and overview (FR-6)', () => {
  test('creates a page from the sidebar', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);

    await page.getByTestId('new-page').click();
    await page.getByTestId('new-page-input').fill('Home Server');
    await page.getByTestId('new-page-input').press('Enter');

    await expect(page.getByTestId('nav-page-Home Server')).toBeVisible();
  });

  test('groups tasks by page in Overview (FR-6.5)', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'First page task' });
    const other = await (await request.post('/api/pages', { data: { name: 'Other' } })).json();
    await request.post('/api/tasks', { data: { title: 'Other page task', page_id: other.id } });

    await page.goto('/');
    await ready(page);

    await expect(page.getByTestId('overview-group-Test Page')).toBeVisible();
    await expect(page.getByTestId('overview-group-Other')).toBeVisible();
    await expect(page.getByTestId('task-row-First page task')).toBeVisible();
    await expect(page.getByTestId('task-row-Other page task')).toBeVisible();
  });

  test('reorders pages by dragging (FR-6.2)', async ({ page, request, seeded }) => {
    await request.post('/api/pages', { data: { name: 'Beta' } });
    await request.post('/api/pages', { data: { name: 'Gamma' } });

    await page.goto('/');
    await ready(page);

    const before = await (await page.request.get('/api/pages')).json();
    expect(before.map((p: any) => p.name)).toEqual(['Test Page', 'Beta', 'Gamma']);

    const handle = page.getByTestId('page-handle-Gamma');
    const target = page.getByTestId('nav-page-Test Page');
    await handle.hover();
    await page.mouse.down();
    const box = await target.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 12 });
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 2, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const pages = await (await page.request.get('/api/pages')).json();
        return pages.map((p: any) => p.name);
      })
      .toEqual(['Gamma', 'Test Page', 'Beta']);
  });

  test('requires a policy when deleting a page with tasks (FR-6.3)', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Should survive' });
    await request.post('/api/pages', { data: { name: 'Doomed' } });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-settings').click();

    await page.getByTestId('delete-page-Doomed').click();
    // The choice is required — there is no delete that silently discards tasks.
    await expect(page.getByTestId('delete-policy-Doomed')).toBeVisible();
    await page.getByTestId('delete-policy-Doomed').selectOption({ label: 'Move to Test Page' });

    await expect(page.getByTestId('nav-page-Doomed')).toBeHidden();
    const tasks = await (await page.request.get('/api/tasks?page_id=e2e-page')).json();
    expect(tasks.map((t: any) => t.title)).toContain('Should survive');
  });
});
