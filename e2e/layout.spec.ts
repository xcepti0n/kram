import { createTask, expect, ready, test } from './fixtures.js';
import type { Page } from '@playwright/test';

/**
 * Column alignment and row geometry.
 *
 * The task row was a flex row, so metadata was pushed right by whatever
 * preceded it: three consecutive rows put their date at x=1232, 1249 and 1271.
 * Nothing failed — it just looked untidy — and no existing test could see it,
 * because they all assert on content rather than position. These measure the
 * layout itself.
 */

/** Distinct x positions for one part of the row, across every visible row. */
const columnXs = (page: Page, part: string) =>
  page.evaluate((p) => {
    const rows = [...document.querySelectorAll('li')].filter((r) => r.querySelector('[class*="title"]'));
    const xs = rows
      .map((r) => r.querySelector(`[class*="${p}"]`)?.getBoundingClientRect().x)
      .filter((v): v is number => v != null)
      .map(Math.round);
    return [...new Set(xs)];
  }, part);

test.describe('task row layout', () => {
  /**
   * Titles of very different lengths are the case that broke alignment.
   *
   * Called inside each test rather than from beforeEach: the `seeded` fixture
   * wipes the database, and fixtures resolve after hooks — so anything created
   * in beforeEach is deleted before the test body runs.
   */
  const withTasks = async (request: import('@playwright/test').APIRequestContext) => {
    for (const title of ['Alpha', 'A considerably longer task title than the others', 'Beta task']) {
      await createTask(request, { title });
    }
  };

  test('aligns date and title into single columns whatever the title length', async ({ page, request, seeded }) => {
    await withTasks(request);
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await expect(page.getByTestId('task-row-Alpha')).toBeVisible();

    expect(await columnXs(page, 'title')).toHaveLength(1);
    expect(await columnXs(page, 'date')).toHaveLength(1);
  });

  /*
   * Every breakpoint needs its own grid template: hiding an item with
   * display:none leaves its track behind, which silently wrapped each row onto
   * a second line and doubled the row height at 412px and 768px.
   */
  for (const width of [360, 480, 768, 1024, 1280, 1440]) {
    test(`keeps each row on a single grid line at ${width}px`, async ({ page, request, seeded }) => {
      await withTasks(request);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);
      // Overview lists every page's tasks, so there is no nav click to make —
      // below ~720px the sidebar is off-screen behind the menu button, and
      // clicking it there times out rather than failing on the layout.
      await expect(page.getByTestId('task-row-Alpha')).toBeVisible();

      const lines = await page.evaluate(() => {
        const row = [...document.querySelectorAll('li')].find((r) => r.querySelector('[class*="title"]'));
        return row ? getComputedStyle(row).gridTemplateRows.trim().split(/\s+/).length : 0;
      });
      expect(lines, `row wrapped onto ${lines} lines at this width`).toBe(1);
    });
  }

  test('never scrolls sideways at any width', async ({ page, request, seeded }) => {
    await withTasks(request);
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await expect(page.getByTestId('task-row-Alpha')).toBeVisible();

    for (const width of [320, 360, 412, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `horizontal overflow at ${width}px`).toBe(false);
    }
  });

  /*
   * The circle is 17px by design; the hit area is extended with a transparent
   * ::after. Asserting the drawn size would defeat the point, so measure reach.
   */
  test('gives the completion checkbox a 44px touch target', async ({ page, request, seeded }) => {
    await withTasks(request);
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await expect(page.getByTestId('task-row-Alpha')).toBeVisible();

    const reach = await page.evaluate(() => {
      const cb = document.querySelector('[class*="checkbox"]');
      if (!cb) return 0;
      const inset = Math.abs(parseFloat(getComputedStyle(cb, '::after').top) || 0);
      return Math.round(cb.getBoundingClientRect().height + inset * 2);
    });
    expect(reach).toBeGreaterThanOrEqual(44);
  });
});
