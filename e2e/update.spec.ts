import { expect, ready, test } from './fixtures.js';

/**
 * Applying an update from the UI (DD-30, DD-43).
 *
 * The real thing cannot be exercised here — it rebuilds and restarts the server
 * the tests are running against. What these cover is everything around it: that
 * the button appears when the server can apply, that a refusal is reported in
 * words rather than a wall of systemctl output, and that the progress display
 * does not claim success before the restart has even begun.
 */
test.describe('applying an update', () => {
  test('shows the button when an update is available and applicable', async ({ page, seeded }) => {
    await page.route('**/api/updates', (route) =>
      route.fulfill({
        json: {
          state: 'behind',
          current: 'aaaaaaa',
          latest: 'bbbbbbb',
          behind_by: 2,
          can_apply: true,
          commits: [],
        },
      }),
    );

    await page.goto('/settings');
    await ready(page);
    await page.getByTestId('check-updates').click();

    await expect(page.getByTestId('apply-update')).toBeVisible();
  });

  /* A server that cannot apply must say so instead of offering a button that
     fails — and must say what to run instead. */
  test('explains itself when the server cannot apply', async ({ page, seeded }) => {
    await page.route('**/api/updates', (route) =>
      route.fulfill({
        json: {
          state: 'behind',
          current: 'aaaaaaa',
          latest: 'bbbbbbb',
          behind_by: 1,
          can_apply: false,
          commits: [],
        },
      }),
    );

    await page.goto('/settings');
    await ready(page);
    await page.getByTestId('check-updates').click();

    await expect(page.getByTestId('apply-update')).toHaveCount(0);
    await expect(page.getByText(/cannot apply updates itself/)).toBeVisible();
  });

  /* The failure the user actually hit: "Access denied" buried in a dump of the
     whole command line. */
  test('reports a refusal in readable words', async ({ page, seeded }) => {
    await page.route('**/api/updates', (route) =>
      route.fulfill({
        json: {
          state: 'behind', current: 'aaaaaaa', latest: 'bbbbbbb',
          behind_by: 1, can_apply: true, commits: [],
        },
      }),
    );
    await page.route('**/api/updates/apply', (route) =>
      route.fulfill({
        status: 409,
        json: {
          error:
            'the server is not permitted to start the update. The polkit rule is missing or not ' +
            'in effect — run deploy/update.sh from a shell, which installs it.',
        },
      }),
    );

    await page.goto('/settings');
    await ready(page);
    await page.getByTestId('check-updates').click();
    await page.getByTestId('apply-update').click();

    await expect(page.getByTestId('toast-region')).toContainText(/not permitted/);
    // And the button comes back, because nothing was started.
    await expect(page.getByTestId('apply-update')).toBeEnabled();
  });

  test('shows progress rather than going silent', async ({ page, seeded }) => {
    await page.route('**/api/updates', (route) =>
      route.fulfill({
        json: {
          state: 'behind', current: 'aaaaaaa', latest: 'bbbbbbb',
          behind_by: 1, can_apply: true, commits: [],
        },
      }),
    );
    await page.route('**/api/updates/apply', (route) =>
      route.fulfill({ status: 202, json: { started: true } }),
    );

    await page.goto('/settings');
    await ready(page);
    await page.getByTestId('check-updates').click();
    await page.getByTestId('apply-update').click();

    await expect(page.getByTestId('update-progress')).toBeVisible();
    await expect(page.getByTestId('apply-update')).toBeDisabled();
  });

  /* The subtle one: the server is still up when polling starts, so a naive
     "is it healthy" check reports success immediately and the user is told the
     update finished before it began. */
  test('does not report success until the server has actually restarted', async ({
    page,
    seeded,
  }) => {
    await page.route('**/api/updates', (route) =>
      route.fulfill({
        json: {
          state: 'behind', current: 'aaaaaaa', latest: 'bbbbbbb',
          behind_by: 1, can_apply: true, commits: [],
        },
      }),
    );
    await page.route('**/api/updates/apply', (route) =>
      route.fulfill({ status: 202, json: { started: true } }),
    );
    // Health keeps answering: the server never goes down in this scenario.
    await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ok' } }));

    await page.goto('/settings');
    await ready(page);
    await page.getByTestId('check-updates').click();

    /* Re-route the check so a later poll would report the NEW commit as
       current. Without this the poll always sees the old one and takes the
       rolled-back branch, so the test passes whether or not the "must have
       gone down first" guard exists — it never reaches the success path. */
    await page.route('**/api/updates', (route) =>
      route.fulfill({
        json: {
          state: 'up-to-date', current: 'bbbbbbb', latest: 'bbbbbbb',
          behind_by: 0, can_apply: true, commits: [],
        },
      }),
    );

    await page.getByTestId('apply-update').click();

    // Well past two poll intervals, it must still be waiting: the server never
    // went down, so nothing was restarted and nothing has been updated.
    await page.waitForTimeout(8000);
    await expect(page.getByTestId('update-progress')).not.toContainText(/Updated and running/);
  });
});
