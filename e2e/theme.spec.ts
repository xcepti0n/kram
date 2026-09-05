import { createTask, expect, ready, test } from './fixtures.js';

test.describe('theming (FR-9)', () => {
  test('each theme changes layout geometry, not just colour', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Measure me' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    // Measure a rendered row rather than reading the token: the token's value is
    // a calc() expression, which only resolves against a real element.
    const rowHeight = async () => {
      const box = await page.getByTestId('task-row-Measure me').boundingBox();
      return box!.height;
    };

    const applyTheme = async (name: string) => {
      await page.getByTestId('nav-settings').click();
      await page.getByTestId(`theme-${name}`).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', name);
      await page.getByTestId('nav-page-Test Page').click();
    };

    await applyTheme('calm');
    const calm = await rowHeight();

    await applyTheme('dense');
    const dense = await rowHeight();

    await applyTheme('bold');
    const bold = await rowHeight();

    // Dense is tighter than Calm, Bold is looser — a genuinely different
    // reading experience rather than a recolour.
    expect(dense).toBeLessThan(calm);
    expect(bold).toBeGreaterThan(calm);
  });

  test('compact density tightens rows within a theme', async ({ page, request, seeded }) => {
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

    expect(await rowHeight()).toBeLessThan(comfortable);
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
    await page.getByTestId('theme-dense').click();
    await page.getByTestId('mode-dark').click();

    await page.reload();
    // Applied by the inline script before React runs, so it is correct on the
    // very first paint rather than after the settings request returns.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dense');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  });
});
