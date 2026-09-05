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

test.describe('mobile panels', () => {
  test('closes the sidebar by tapping the scrim', async ({ page, seeded }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="nav-overview"], [data-testid="task-composer"]');

    const sidebar = page.locator('nav');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect.poll(async () => (await sidebar.boundingBox())!.x).toBe(0);

    // Tap just past the panel's right edge, on the scrim.
    const box = (await sidebar.boundingBox())!;
    await page.mouse.click(box.x + box.width + 20, 500);

    // It slides off-screen. A CSS transform does not change visibility, so the
    // position is what to assert on.
    await expect
      .poll(async () => (await sidebar.boundingBox())!.x)
      .toBeLessThan(-100);
  });

  test('opens the task sheet as a bottom sheet with a drag handle', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Sheet me' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Sheet me').click();

    const sheet = page.getByTestId('task-sheet');
    await expect(sheet).toBeVisible();
    // The grabber only exists on touch layouts; its presence is what makes the
    // sheet dismissible by gesture.
    await expect(page.getByTestId('sheet-grabber')).toBeVisible();

    const box = await sheet.boundingBox();
    const viewport = page.viewportSize()!;
    // A bottom sheet: full width, anchored to the bottom of the screen.
    expect(box!.width).toBeGreaterThan(viewport.width * 0.9);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 2);
  });

  test('collapses the timeline name column for more chart', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Charted' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByTestId('nav-timeline').click();
    await page.waitForSelector('[data-testid="timeline-svg"]');

    await expect(page.getByTestId('timeline-task-Charted')).toBeVisible();

    await page.getByTestId('timeline-toggle-names').click();
    // The name becomes a colour swatch, so the row is still identifiable.
    const swatch = page.getByTestId('timeline-task-Charted');
    await expect(swatch).toHaveJSProperty('tagName', 'rect');

    await page.getByTestId('timeline-toggle-names').click();
    await expect(page.getByTestId('timeline-task-Charted')).toHaveJSProperty('tagName', 'text');
  });

  test('keeps axis labels legible on a narrow screen', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Spanning', created_on: '2026-06-01' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByTestId('nav-timeline').click();
    await page.waitForSelector('[data-testid="timeline-svg"]');
    await page.getByTestId('zoom-month').click();

    // Labels are thinned to what fits, so none of them overlap.
    const boxes = await page
      .locator('[data-testid="timeline-svg"] text')
      .filter({ hasNotText: /^$/ })
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => (n.textContent ?? '').trim().length > 0)
          .map((n) => {
            const b = (n as SVGGraphicsElement).getBBox();
            return { x: b.x, right: b.x + b.width, y: b.y };
          }),
      );

    const axis = boxes.filter((b) => b.y < 30).sort((a, b) => a.x - b.x);
    for (let i = 1; i < axis.length; i += 1) {
      expect(axis[i]!.x).toBeGreaterThanOrEqual(axis[i - 1]!.right - 1);
    }
  });
});
