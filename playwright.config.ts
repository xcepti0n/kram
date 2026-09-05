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
    command: `PORT=${PORT} DATA_DIR=.playwright-data node server/dist/index.js`,
    port: PORT,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
