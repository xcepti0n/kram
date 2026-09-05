import { createTask, expect, ready, test } from './fixtures.js';

test.describe('timeline (FR-5)', () => {
  test('draws a line per task with a point per update', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'Build app', created_on: '2026-08-12' });
    await request.post(`/api/tasks/${task.id}/updates`, {
      data: { body: 'Added backend', occurred_on: '2026-08-19', status: 'in_progress' },
    });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-timeline').click();

    await expect(page.getByTestId('timeline-svg')).toBeVisible();
    await expect(page.getByTestId('timeline-task-Build app')).toBeVisible();
    await expect(page.getByTestId('point-Build app').first()).toBeVisible();
  });

  test('renders a blocked stretch as its own segment (FR-4, FR-5.3)', async ({
    page,
    request,
    seeded,
  }) => {
    const task = await createTask(request, { title: 'Stalled', created_on: '2026-08-01' });
    await request.patch(`/api/tasks/${task.id}/status`, {
      data: { status: 'in_progress', occurred_on: '2026-08-05' },
    });
    await request.patch(`/api/tasks/${task.id}/status`, {
      data: { status: 'blocked', occurred_on: '2026-08-10' },
    });
    await request.patch(`/api/tasks/${task.id}/status`, {
      data: { status: 'in_progress', occurred_on: '2026-08-20' },
    });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-timeline').click();
    await page.getByTestId('zoom-month').click();

    // The blocked interval is a distinct, measurable span — the reason status
    // history exists at all.
    const blocked = page.getByTestId('segment-Stalled-blocked');
    await expect(blocked).toHaveCount(1);
    await expect(blocked).toHaveAttribute('data-status', 'blocked');
  });

  test('terminates a done task and continues an open one', async ({ page, request, seeded }) => {
    const done = await createTask(request, { title: 'Finished', created_on: '2026-08-01' });
    await request.patch(`/api/tasks/${done.id}/status`, {
      data: { status: 'done', occurred_on: '2026-08-20' },
    });
    await createTask(request, { title: 'Ongoing', created_on: '2026-08-01' });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-timeline').click();
    await page.getByTestId('zoom-month').click();

    await expect(page.getByTestId('cap-done-Finished')).toBeVisible();
    await expect(page.getByTestId('cap-open-Ongoing')).toBeVisible();
  });

  test('shows a today marker and zooms between levels', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Anything' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-timeline').click();

    // A zero-width SVG line has no bounding box, so assert on presence and a
    // real x position rather than Playwright's visibility heuristic.
    const marker = page.getByTestId('today-marker');
    await expect(marker).toHaveCount(1);
    expect(Number(await marker.getAttribute('x1'))).toBeGreaterThan(0);

    for (const level of ['day', 'week', 'month', 'quarter']) {
      await page.getByTestId(`zoom-${level}`).click();
      await expect(page.getByTestId(`zoom-${level}`)).toHaveAttribute('data-active', 'true');
    }
  });

  test('reveals the update text on hover (FR-5.6)', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'Hoverable' });
    await request.post(`/api/tasks/${task.id}/updates`, {
      data: { body: 'A notable thing happened' },
    });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-timeline').click();

    await page.getByTestId('point-Hoverable').first().hover();
    await expect(page.getByTestId('timeline-hover-card')).toContainText('A notable thing happened');
  });

  test('groups by page in the overall timeline (FR-6.5)', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'On test page' });
    const other = await (
      await request.post('/api/pages', { data: { name: 'Second Page' } })
    ).json();
    await request.post('/api/tasks', { data: { title: 'On second', page_id: other.id } });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-timeline').click();

    await expect(page.getByTestId('timeline-group-Test Page')).toBeVisible();
    await expect(page.getByTestId('timeline-group-Second Page')).toBeVisible();
  });
});
