import { createTask, expect, ready, test } from './fixtures.js';

test.describe('ordering (FR-7)', () => {
  test('drags a task to a new position and persists it', async ({ page, request, seeded }) => {
    for (const title of ['Alpha', 'Bravo', 'Charlie']) {
      await createTask(request, { title });
    }

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    const handle = page.getByTestId('drag-handle-Charlie');
    const target = page.getByTestId('task-row-Alpha');
    await handle.hover();
    await page.mouse.down();
    // Several small moves: dnd-kit needs movement events to register a drag.
    const box = await target.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 12 });
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 2, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const tasks = await (await page.request.get('/api/tasks?page_id=e2e-page')).json();
        return tasks.map((t: any) => t.title);
      })
      .toEqual(['Charlie', 'Alpha', 'Bravo']);

    // Survives a reload — the order is stored, not just local.
    await page.reload();
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await expect(page.getByTestId('task-row-Charlie')).toBeVisible();
    const titles = await page.locator('[data-testid^="task-row-"]').allTextContents();
    expect(titles[0]).toContain('Charlie');
  });

  test('sorts without losing manual order (DD-17)', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Zeta' });
    await createTask(request, { title: 'Alpha' });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    await expect(page.getByTestId('task-row-Zeta')).toBeVisible();
    const titles = await page.locator('[data-testid^="task-row-"]').allTextContents();
    expect(titles[0]).toContain('Zeta'); // creation order

    await page.getByTestId('sort-select').selectOption('title');
    await expect
      .poll(async () => {
        const rows = await page.locator('[data-testid^="task-row-"]').allTextContents();
        return rows[0];
      })
      .toContain('Alpha');

    // Drag is off under a non-manual sort, since it would have nowhere to persist.
    await expect(page.getByTestId('drag-handle-Alpha')).toBeHidden();

    await page.getByTestId('sort-select').selectOption('manual');
    await expect
      .poll(async () => {
        const rows = await page.locator('[data-testid^="task-row-"]').allTextContents();
        return rows[0];
      })
      .toContain('Zeta');
  });
});
