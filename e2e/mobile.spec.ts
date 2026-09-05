import { createTask, expect, ready, test } from './fixtures.js';

/**
 * The app is used from a phone as well as a laptop (NFR-2), so the shell layout
 * and the touch-critical interactions get their own coverage.
 */
test.describe('mobile', () => {
  test('collapses the sidebar behind a menu button', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Something to draw' });
    await page.goto('/');
    await page.waitForSelector('[data-testid="task-composer"], [data-testid="nav-overview"]');

    const menu = page.getByRole('button', { name: 'Open menu' });
    await expect(menu).toBeVisible();

    await menu.click();
    await expect(page.getByTestId('nav-timeline')).toBeVisible();
    await page.getByTestId('nav-timeline').click();
    await expect(page.getByTestId('timeline-svg')).toBeVisible();
  });

  test('creates a task on a narrow screen', async ({ page, request, seeded }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByTestId('nav-page-Test Page').click();

    await page.getByTestId('task-composer').fill('From my phone');
    await page.getByTestId('task-composer').press('Enter');
    await expect(page.getByTestId('task-row-From my phone')).toBeVisible();
  });

  test('shows drag handles without hover', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Draggable' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByTestId('nav-page-Test Page').click();

    // Hover cannot reveal an affordance on touch, so the handle is always shown.
    await expect(page.getByTestId('drag-handle-Draggable')).toBeVisible();
  });
});
