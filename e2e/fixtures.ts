import { test as base, expect, type Page } from '@playwright/test';
import { EXPORT_FORMAT } from '@kram/shared';

/**
 * Each spec starts from a known-empty database: the suite runs against one
 * server, so tests clean up after themselves through the API rather than
 * depending on order.
 */
export interface Seeded {
  pageId: string;
}

export const test = base.extend<{ seeded: Seeded }>({
  seeded: async ({ request }, use) => {
    // Wipe by importing an empty-but-valid document; the seed then recreates a
    // default user and page on the next read.
    const current = await (await request.get('/api/export')).json();
    const firstUser = current.users[0];

    await request.post('/api/import?mode=replace', {
      data: {
        format: EXPORT_FORMAT,
        version: 1,
        exported_at: new Date().toISOString(),
        users: [firstUser],
        pages: [
          {
            id: 'e2e-page',
            name: 'Test Page',
            colour: '#4C7EF3',
            position: 'U',
            created_at: new Date().toISOString(),
            members: [firstUser.id],
          },
        ],
        tasks: [],
        settings: [
          {
            user_id: firstUser.id,
            theme: 'calm',
            mode: 'light',
            density: 'comfortable',
            hide_done: false,
          },
        ],
      },
    });

    await use({ pageId: 'e2e-page' });
  },
});

export { expect };

/** Create a task through the API — faster and less brittle than driving the UI
 *  when the task is setup rather than the thing under test. */
export async function createTask(
  request: import('@playwright/test').APIRequestContext,
  body: Record<string, unknown>,
): Promise<any> {
  const response = await request.post('/api/tasks', {
    data: { page_id: 'e2e-page', ...body },
  });
  return response.json();
}

/** Wait for the app shell to be interactive. */
export async function ready(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="nav-overview"]');
}
