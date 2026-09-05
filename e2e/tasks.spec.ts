import { createTask, expect, ready, test } from './fixtures.js';

test.describe('tasks (FR-1, FR-2, FR-4)', () => {
  test('creates a task from a title alone', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    await page.getByTestId('task-composer').fill('Build the thing');
    await page.getByTestId('task-composer').press('Enter');

    await expect(page.getByTestId('task-row-Build the thing')).toBeVisible();
    // The composer stays focused so several tasks can be captured in a row.
    await expect(page.getByTestId('task-composer')).toBeFocused();
    await expect(page.getByTestId('task-composer')).toHaveValue('');
  });

  test('new tasks append to the bottom (DD-18)', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    for (const title of ['First', 'Second', 'Third']) {
      await page.getByTestId('task-composer').fill(title);
      await page.getByTestId('task-composer').press('Enter');
      await expect(page.getByTestId(`task-row-${title}`)).toBeVisible();
    }

    const titles = await page.locator('[data-testid^="task-row-"]').allTextContents();
    expect(titles[0]).toContain('First');
    expect(titles[2]).toContain('Third');
  });

  test('completes and reopens from the row', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Finish me' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    await page.getByTestId('complete-Finish me').click();
    await expect(page.getByTestId('task-row-Finish me')).toHaveAttribute('data-done', 'true');

    await page.getByTestId('complete-Finish me').click();
    await expect(page.getByTestId('task-row-Finish me')).not.toHaveAttribute('data-done', 'true');
  });

  test('deletes with an undo toast rather than a confirmation (FR-10.5)', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Delete me' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    await page.getByTestId('delete-Delete me').click();
    await expect(page.getByTestId('task-row-Delete me')).toBeHidden();

    // No dialog appeared; the recovery path is the toast.
    const toast = page.getByTestId('toast-region');
    await expect(toast).toContainText('Deleted');
    await toast.getByRole('button', { name: 'Undo' }).click();

    await expect(page.getByTestId('task-row-Delete me')).toBeVisible();
  });

  test('backdates the start date from the sheet (FR-2.2)', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Backdate me' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Backdate me').click();

    await expect(page.getByTestId('task-sheet')).toBeVisible();
    await page.getByTestId('sheet-created-on').click();
    const input = page.getByTestId('sheet-created-on');
    await input.fill('2026-08-12');
    await input.press('Enter');

    await page.getByTestId('sheet-close').click();
    const tasks = await (await page.request.get('/api/tasks?page_id=e2e-page')).json();
    expect(tasks[0].created_on).toBe('2026-08-12');
  });

  test('accepts typed natural dates (FR-10.6)', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Natural date' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Natural date').click();

    await page.getByTestId('sheet-created-on').click();
    const input = page.getByTestId('sheet-created-on');
    await input.fill('yesterday');
    await input.press('Enter');

    const tasks = await (await page.request.get('/api/tasks?page_id=e2e-page')).json();
    // Local calendar day, not UTC — the app stores days as the user means them,
    // and toISOString() would disagree either side of midnight.
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    expect(tasks[0].created_on).toBe(expected);
  });

  test('opens the quick composer with C from anywhere (FR-10.1)', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);

    await page.keyboard.press('c');
    const quick = page.getByRole('dialog', { name: 'Quick add task' });
    await expect(quick).toBeVisible();

    await quick.getByTestId('task-composer').fill('Captured fast');
    await quick.getByTestId('task-composer').press('Enter');

    await expect(quick).toBeHidden();
    await expect(page.getByTestId('task-row-Captured fast')).toBeVisible();
  });
});
