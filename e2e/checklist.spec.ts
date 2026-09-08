import { createTask, expect, ready, test } from './fixtures.js';
import type { Page } from '@playwright/test';

/**
 * Checklists in the task sheet (DD-36).
 *
 * The API tests cover the batching; these cover the part only a browser can
 * show — that a list can be entered in a run, that ticking reads as instant,
 * and that the row's progress chip does not break the column alignment the
 * layout tests pin.
 */

/**
 * Open a task's sheet and wait for it to settle.
 *
 * The sheet slides in, so for ~120ms after it becomes visible everything
 * inside is still moving and Playwright refuses to click ("element is not
 * stable"). Waiting for the animation to finish is the honest wait — a
 * hard-coded timeout would be the same wait, less clearly.
 */
async function openTask(page: Page, title: string) {
  await page.getByText(title).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))),
  );
}

async function addItems(page: Page, ...texts: string[]) {
  const input = page.getByTestId('checklist-add');
  for (const text of texts) {
    await input.fill(text);
    await input.press('Enter');
    await expect(page.getByRole('checkbox', { name: text })).toBeVisible();
  }
}

test.describe('checklist', () => {
  test('adds items one after another without leaving the field', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');

    await addItems(page, 'Milk', 'Eggs', 'Bread');

    // Focus stays put: a list is typed in a run, not one item per click.
    await expect(page.getByTestId('checklist-add')).toBeFocused();
    await expect(page.getByTestId('checklist-count')).toHaveText('0/3');
  });

  test('ticks an item and shows the date it was done', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');
    await addItems(page, 'Milk', 'Eggs');

    await page.getByRole('checkbox', { name: 'Milk' }).click();

    await expect(page.getByTestId('checklist-count')).toHaveText('1/2');
    // The item carries its own date — the answer to "when did I buy this".
    const item = page.locator('li', { has: page.getByRole('checkbox', { name: 'Milk' }) });
    await expect(item.locator('time')).toBeVisible();
  });

  test('unticks an item', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');
    await addItems(page, 'Milk');

    /* .click() rather than .check(): the checkbox is controlled, so its DOM
       state lags the cache by a paint, and .check()'s built-in retry clicks it
       a second time and toggles it back. The count is the real assertion. */
    const box = page.getByRole('checkbox', { name: 'Milk' });
    await box.click();
    await expect(page.getByTestId('checklist-count')).toHaveText('1/1');
    await box.click();
    await expect(page.getByTestId('checklist-count')).toHaveText('0/1');
  });

  /* One line for a shop, not one per item — the requirement that shaped the
     schema, verified through the UI it exists for. */
  test('summarises a day of ticking as a single history entry', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');
    await addItems(page, 'Milk', 'Eggs', 'Bread');

    for (const name of ['Milk', 'Eggs', 'Bread']) {
      await page.getByRole('checkbox', { name }).click();
    }

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Checked off/)).toHaveCount(1);
    await expect(dialog.getByText(/All 3 done/)).toBeVisible();
  });

  test('renames an item in place', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');
    await addItems(page, 'Mlik');

    // exact, or "Remove Mlik" matches too.
    await page.getByRole('button', { name: 'Mlik', exact: true }).click();
    const editor = page.getByTestId('checklist-edit');
    await editor.fill('Milk');
    await editor.press('Enter');

    await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible();
  });

  test('removes an item', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');
    await addItems(page, 'Milk', 'Eggs');

    await page.getByRole('button', { name: 'Remove Milk' }).click();
    await expect(page.getByRole('checkbox', { name: 'Milk' })).toHaveCount(0);
    await expect(page.getByTestId('checklist-count')).toHaveText('0/1');
  });

  /* A standing list refills; reset is what makes that possible without
     recreating the items every week. */
  test('resets the ticks but keeps the items', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');
    await addItems(page, 'Milk', 'Eggs');
    await page.getByRole('checkbox', { name: 'Milk' }).click();

    // Two-step, so a stray click does not wipe the list.
    await page.getByTestId('checklist-reset').click();
    await expect(page.getByTestId('checklist-reset')).toHaveText(/Clear all ticks\?/);
    await page.getByTestId('checklist-reset').click();

    await expect(page.getByTestId('checklist-count')).toHaveText('0/2');
    await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible();
  });

  test('offers no reset until something is ticked', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');
    await addItems(page, 'Milk');

    await expect(page.getByTestId('checklist-reset')).toHaveCount(0);
  });

  /* Escape inside the composer must clear the draft, not close the sheet the
     user is typing into. */
  test('keeps the sheet open when Escape clears a draft item', async ({
    page,
    request,
    seeded,
  }) => {
    await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Buy groceries');

    const input = page.getByTestId('checklist-add');
    await input.fill('Half-typed item');
    await input.press('Escape');

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(input).toHaveValue('');
  });
});

test.describe('checklist on the task row', () => {
  test('shows progress without opening the task', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
    await request.post(`/api/tasks/${task.id}/checklist`, { data: { text: 'Milk' } });
    await request.post(`/api/tasks/${task.id}/checklist`, { data: { text: 'Eggs' } });

    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await expect(page.getByTestId('row-checklist')).toHaveText('0/2');
  });

  test('shows nothing for a task without a list', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Plain task', page_id: seeded.pageId });
    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await expect(page.getByTestId('row-checklist')).toHaveCount(0);
  });

  /* The row is a grid with named tracks (DD-32); a new cell is exactly the kind
     of change that silently breaks the alignment those tests pin. */
  for (const width of [360, 480, 768, 1024, 1280, 1600]) {
    test(`keeps the row on one grid line at ${width}px with a checklist`, async ({
      page,
      request,
      seeded,
    }) => {
      const task = await createTask(request, { title: 'Buy groceries', page_id: seeded.pageId });
      await request.post(`/api/tasks/${task.id}/checklist`, { data: { text: 'Milk' } });
      await createTask(request, { title: 'A task with no checklist at all', page_id: seeded.pageId });

      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/p/${seeded.pageId}`);
      await ready(page);

      // Read the resolved template, as layout.spec does: counting cell
      // positions also catches the sidebar's list items, which are not rows.
      const lines = await page.evaluate(() => {
        const row = [...document.querySelectorAll('li')].find((r) =>
          r.querySelector('[class*="title"]'),
        );
        return row ? getComputedStyle(row).gridTemplateRows.trim().split(/\s+/).length : 0;
      });
      expect(lines, `row wrapped onto ${lines} lines at ${width}px`).toBe(1);

      // And nothing overflows horizontally.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }
});
