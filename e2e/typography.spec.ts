import { expect, ready, test } from './fixtures.js';
import type { Page } from '@playwright/test';

/**
 * The type scale (DD-39).
 *
 * The multipliers were once picked by eye, giving step ratios that climbed
 * 1.10, 1.15, 1.20, 1.29, 1.36 — not a scale, so the small end was cramped and
 * the top sprawled. Nothing in the suite could see that, because every test
 * asserts on content rather than on computed size. These measure the scale the
 * browser actually resolves, which also catches a token that is defined and
 * then overridden somewhere.
 */

const SIZES = ['xs', 'sm', 'base', 'lg', 'xl'] as const;

/**
 * Resolve the type tokens to pixels, in order.
 *
 * Applied to a real element rather than read off :root — getPropertyValue on a
 * custom property hands back the unresolved token, so --font-size-sm reads as
 * the literal string "calc(calc(14.5px * (.5 + 1 * .5)) / 1.125)". Only
 * assigning it to a font-size makes the browser compute it.
 */
const scale = (page: Page) =>
  page.evaluate((names) => {
    const el = document.createElement('span');
    document.body.appendChild(el);
    try {
      return names.map((n) => {
        el.style.fontSize = `var(--font-size-${n})`;
        return parseFloat(getComputedStyle(el).fontSize);
      });
    } finally {
      el.remove();
    }
  }, SIZES as unknown as string[]);

test.describe('type scale', () => {
  test('rises monotonically with no duplicate steps', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);

    const sizes = await scale(page);
    expect(sizes.every((n) => Number.isFinite(n) && n > 0)).toBe(true);

    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i], `${SIZES[i]} must be larger than ${SIZES[i - 1]}`).toBeGreaterThan(
        sizes[i - 1]!,
      );
    }
  });

  /* The actual defect: adjacent sizes so close they read as the same. xs and
     sm were 11.46 and 12.62 — a 1.101 step, which a 1.1 threshold waved
     through. 1.12 is the smallest step this scale actually uses. */
  test('separates every adjacent pair by at least 1.12', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);

    const sizes = await scale(page);
    for (let i = 1; i < sizes.length; i++) {
      const ratio = sizes[i]! / sizes[i - 1]!;
      expect(ratio, `${SIZES[i - 1]}→${SIZES[i]} step is ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(
        1.12,
      );
    }
  });

  /* Two ratios, not five: 1.125 for UI text below the base, 1.25 for display
     sizes above it. A third distinct ratio means someone added a multiplier by
     eye again. */
  test('uses exactly two step ratios', async ({ page, seeded }) => {
    await page.goto('/');
    await ready(page);

    const sizes = await scale(page);
    const ratios = sizes.slice(1).map((n, i) => Number((n / sizes[i]!).toFixed(3)));

    expect(ratios).toEqual([1.125, 1.125, 1.25, 1.25]);
  });

  /* Density scales the whole set, so the ratios must survive it — that is the
     reason the tokens are ratios rather than fixed pixels. */
  test('keeps its ratios under compact density', async ({ page, seeded }) => {
    await page.goto('/settings');
    await ready(page);
    await page.getByRole('button', { name: 'Compact', exact: true }).click();

    await expect.poll(() => page.getAttribute('html', 'data-density')).toBe('compact');

    const sizes = await scale(page);
    const ratios = sizes.slice(1).map((n, i) => Number((n / sizes[i]!).toFixed(3)));
    expect(ratios).toEqual([1.125, 1.125, 1.25, 1.25]);

    // And everything actually got smaller, or density is doing nothing.
    expect(sizes[2]).toBeLessThan(14.5);
  });
});
