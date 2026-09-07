import { createTask, expect, ready, test } from './fixtures.js';

/**
 * Navigation state in the URL (DD-35).
 *
 * The reported symptom was narrow — open Settings, refresh, land on Overview —
 * but nothing was in the URL, so the same was true of every page and of any
 * open task. The unit tests cover the parse/build round trip; these cover the
 * part that round trip cannot prove, which is that a real reload restores what
 * was on screen.
 */
test.describe('routing', () => {
  test('puts each view in the URL and restores it on reload', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);
    await expect(page).toHaveURL(/\/$/);

    for (const [nav, path, heading] of [
      ['Settings', '/settings', 'Settings'],
      ['Timeline', '/timeline', 'Timeline'],
    ] as const) {
      await page.getByRole('button', { name: nav, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));

      // The actual bug: reload and stay put.
      await page.reload();
      await ready(page);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('gives a page its own address', async ({ page, seeded }) => {
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await expect(page.getByRole('heading', { name: 'Test Page' })).toBeVisible();
  });

  /* The point of task URLs: a link that opens the task for someone else. */
  test('opens a task from a link', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'Linkable task', page_id: seeded.pageId });

    await page.goto(`/p/${seeded.pageId}?task=${task.id}`);
    await ready(page);

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Linkable task')).toBeVisible();
  });

  test('reflects opening and closing a task in the URL', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'Clickable task', page_id: seeded.pageId });

    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await page.getByText('Clickable task').click();
    await expect(page).toHaveURL(new RegExp(`task=${task.id}`));

    // Wait for the sheet itself, not just the URL: it registers its Escape
    // handler on mount, and the task query has to resolve first — pressing
    // Escape before that lands on nothing.
    await expect(page.getByRole('dialog')).toBeVisible();

    // Closing returns to the list it was opened from, not to Overview.
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/p/${seeded.pageId}$`));
  });

  /* Back has to work like a browser, or URLs are decoration. */
  test('supports back and forward', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);

    await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    await expect(page).toHaveURL(/\/timeline$/);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  /* An unknown path is served index.html by the server, so the app must render
     something rather than a blank screen. */
  test('renders the app for an unknown path', async ({ page, seeded }) => {
    await page.goto('/does-not-exist');
    await ready(page);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });
});
