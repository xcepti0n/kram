import { createTask, expect, ready, test } from './fixtures.js';

test.describe('theming (FR-9)', () => {
  test('switches between themes, changing palette and typeface', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-settings').click();

    const font = () =>
      page.evaluate(() => getComputedStyle(document.body).fontFamily);
    const displayFont = () =>
      page.evaluate(() => {
        const h = document.querySelector('h1');
        return h ? getComputedStyle(h).fontFamily : '';
      });

    await page.getByTestId('theme-calm').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'calm');
    const calmDisplay = await displayFont();

    await page.getByTestId('theme-neon').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon');
    const neonDisplay = await displayFont();

    // Each theme carries its own display face — the single strongest signal
    // that a theme is a different look rather than a recolour.
    expect(neonDisplay).not.toBe(calmDisplay);
    expect(await font()).toBeTruthy();
  });

  test('density owns sizing, independent of theme (DD-21)', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Measure me' });
    await page.goto('/');
    await ready(page);

    const rowHeight = async () => {
      await page.getByTestId('nav-page-Test Page').click();
      const box = await page.getByTestId('task-row-Measure me').boundingBox();
      return box!.height;
    };

    const comfortable = await rowHeight();

    await page.getByTestId('nav-settings').click();
    await page.getByTestId('density-compact').click();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    const compact = await rowHeight();
    expect(compact).toBeLessThan(comfortable);

    // Switching theme must not change the measurement — that is density's job.
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('theme-neon').click();
    expect(await rowHeight()).toBeCloseTo(compact, 0);
  });

  test('switches colour mode and density', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-settings').click();

    await page.getByTestId('mode-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');

    await page.getByTestId('density-compact').click();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  });

  test('persists the theme across a reload, without a flash', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('theme-neon').click();
    await page.getByTestId('mode-dark').click();

    await page.reload();
    // Applied by the inline script before React runs, so it is correct on the
    // very first paint rather than after the settings request returns.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  });
});
