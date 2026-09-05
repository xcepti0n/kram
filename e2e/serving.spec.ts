import { expect, test } from './fixtures.js';

/**
 * The production server serves the built SPA and the API from one port (DD-3).
 * This is exactly the path that only exists in a built artefact, so it is easy
 * to break without noticing — a wrong MIME type here means a blank page.
 */
test.describe('static serving', () => {
  test('serves the JS bundle with a JavaScript MIME type', async ({ page, request }) => {
    const html = await (await request.get('/')).text();
    const match = /src="(\/assets\/[^"]+\.js)"/.exec(html);
    expect(match, 'index.html should reference a built bundle').not.toBeNull();

    const asset = await request.get(match![1]!);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-type']).toContain('javascript');
  });

  test('serves the stylesheet with a CSS MIME type', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const match = /href="(\/assets\/[^"]+\.css)"/.exec(html);
    if (!match) return; // no external stylesheet in this build
    const asset = await request.get(match[1]!);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-type']).toContain('css');
  });

  test('falls back to the app for client-side routes', async ({ request }) => {
    const response = await request.get('/some/deep/route');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('html');
  });

  test('still 404s unknown API paths as JSON', async ({ request }) => {
    const response = await request.get('/api/definitely-not-a-route');
    expect(response.status()).toBe(404);
    expect(await response.json()).toHaveProperty('error');
  });

  test('boots without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await page.waitForSelector('[data-testid="nav-overview"]');
    expect(errors).toEqual([]);
  });
});
