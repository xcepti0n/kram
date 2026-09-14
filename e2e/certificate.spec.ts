import { expect, ready, test } from './fixtures.js';

/**
 * The CA root download in Settings (DD-41).
 *
 * The point is that a phone can trust this host without opening a terminal, so
 * what matters is that the button is there, that it hands back a certificate,
 * and that the fingerprint shown is the one the device will display.
 */
test.describe('certificate panel', () => {
  test('offers the certificate from Settings', async ({ page, seeded }) => {
    await page.goto('/settings');
    await ready(page);

    await expect(page.getByTestId('certificate-panel')).toBeVisible();
    await expect(page.getByTestId('download-certificate')).toBeVisible();
  });

  /* The iOS two-step is the most common reason someone installs the profile
     and still sees warnings, so the instructions must actually say it. */
  test('spells out the step iOS hides', async ({ page, seeded }) => {
    await page.goto('/settings');
    await ready(page);

    const panel = page.getByTestId('certificate-panel');
    await expect(panel).toContainText('Certificate Trust Settings');
  });

  test('serves a real certificate as an attachment', async ({ page, seeded }) => {
    const response = await page.request.get('/api/ca-root');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-disposition']).toContain('attachment');
    expect(await response.text()).toContain('BEGIN CERTIFICATE');
  });

  /* Shown so it can be compared against the phone's own display; a wrong
     fingerprint would make that check worse than useless. */
  test('shows a fingerprint matching the served certificate', async ({ page, seeded }) => {
    await page.goto('/settings');
    await ready(page);

    const shown = (await page.getByTestId('certificate-panel').locator('code').textContent())!.trim();
    expect(shown).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);

    const info = await (await page.request.get('/api/ca-root/info')).json();
    expect(shown).toBe(info.fingerprint);
  });

  /* A button that downloads a 404 is worse than no button, so the panel hides
     itself when the host publishes no certificate. */
  test('hides itself when no certificate is published', async ({ page, seeded }) => {
    await page.route('**/api/ca-root/info', (route) =>
      route.fulfill({ json: { available: false, fingerprint: null } }),
    );

    await page.goto('/settings');
    await ready(page);

    await expect(page.getByTestId('certificate-panel')).toHaveCount(0);
  });
});
