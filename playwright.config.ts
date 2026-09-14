import { defineConfig, devices } from '@playwright/test';

const PORT = 4399;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one server, one database
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list']],
  timeout: 20_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  // A real server on a scratch database, torn down with the run. Migrations
  // apply on boot, so this also exercises the production start path.
  webServer: {
    /* A throwaway CA certificate is generated alongside the server so the
       certificate panel's *visible* path is exercised. Without CA_ROOT_PATH
       the endpoint 404s and the panel hides itself, which would leave the
       download button untested. openssl is present wherever these tests run. */
    command:
      `mkdir -p .playwright-data && ` +
      `openssl req -x509 -newkey rsa:2048 -nodes ` +
      `-keyout .playwright-data/ca-key.pem -out .playwright-data/kram-root.crt ` +
      `-days 1 -subj /CN=Kram\\ Test\\ CA 2>/dev/null && ` +
      `PORT=${PORT} DATA_DIR=.playwright-data ` +
      `CA_ROOT_PATH=.playwright-data/kram-root.crt node server/dist/index.js`,
    port: PORT,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
