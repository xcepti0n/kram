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

/**
 * Tick or untick an item.
 *
 * Clicks the label, not the input: the label carries the 44px hit area and so
 * covers the control, which is exactly what a real pointer lands on. Clicking
 * the input directly is refused as intercepted.
 */
function box(page: Page, text: string) {
  return page.locator('label', { has: page.getByRole('checkbox', { name: text }) });
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

    await box(page, 'Milk').click();

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
    await box(page, 'Milk').click();
    await expect(page.getByTestId('checklist-count')).toHaveText('1/1');
    await box(page, 'Milk').click();
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
      await box(page, name).click();
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
    await box(page, 'Milk').click();

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

test.describe('checklist touch targets', () => {
  /* Broken twice by layout changes: first the negative margins that made the
     label overlap its neighbours, then a symmetric ::after that swallowed the
     drag handle. Nothing caught either, because both looked right and only
     failed on click. */
  test('gives the checkbox a 44px reach without covering its neighbours', async ({
    page,
    request,
    seeded,
  }) => {
    const task = await createTask(request, { title: 'Car service', page_id: seeded.pageId });
    await request.post(`/api/tasks/${task.id}/checklist`, { data: { text: 'Oil change' } });

    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Car service');

    const reach = await page.evaluate(() => {
      const cb = document.querySelector('input[type=checkbox][aria-label="Oil change"]')!;
      const label = cb.closest('label')!;
      const after = getComputedStyle(label, '::after');
      const r = label.getBoundingClientRect();
      return {
        height: r.height + parseFloat(after.insetBlockStart) * -2,
        // What sits at the centre of the handle and of the text: neither may
        // be the checkbox label.
        handleIsClickable: (() => {
          const h = document.querySelector('[data-testid="checklist-handle-Oil change"]')!;
          const hr = h.getBoundingClientRect();
          return document.elementFromPoint(hr.x + hr.width / 2, hr.y + hr.height / 2)?.closest('button') === h;
        })(),
        textIsClickable: (() => {
          const t = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Oil change')!;
          const tr = t.getBoundingClientRect();
          return document.elementFromPoint(tr.x + tr.width / 2, tr.y + tr.height / 2) === t;
        })(),
      };
    });

    expect(reach.height, 'checkbox reach should be at least 44px tall').toBeGreaterThanOrEqual(44);
    expect(reach.handleIsClickable, 'the drag handle must not be covered').toBe(true);
    expect(reach.textIsClickable, 'the item text must not be covered').toBe(true);
  });
});

test.describe('checklist ordering', () => {
  test('drags an item to a new position and persists it', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'Car service', page_id: seeded.pageId });
    for (const text of ['Oil change', 'Brake pads', 'Air filter']) {
      await request.post(`/api/tasks/${task.id}/checklist`, { data: { text } });
    }

    await page.goto(`/p/${seeded.pageId}`);
    await ready(page);
    await openTask(page, 'Car service');

    const handle = page.getByTestId('checklist-handle-Air filter');
    // Target the row, not the checkbox: the drop point should be the middle of
    // the item being displaced, and the checkbox is a 15px box at its edge.
    const target = page.locator('li', { has: page.getByRole('checkbox', { name: 'Oil change' }) });

    /* Measure before pressing: sampling after mouse.down() reads a layout
       dnd-kit is already transforming, which is what made the task reorder
       test flaky. */
    await expect(page.locator('[data-testid^="checklist-handle-"]')).toHaveCount(3);
    const rect = (await target.boundingBox())!;

    await handle.hover();
    await page.mouse.down();
    // Several small moves: dnd-kit needs movement to register a drag.
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 12 });
    await page.mouse.move(rect.x + rect.width / 2, rect.y + 2, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const fetched = await (await page.request.get(`/api/tasks/${task.id}`)).json();
        return fetched.checklist.map((i: any) => i.text);
      })
      .toEqual(['Air filter', 'Oil change', 'Brake pads']);
  });

  /* Reordering is presentation, not history: it must not claim anything
     happened that day. */
  test('does not write a history entry', async ({ page, request, seeded }) => {
    const task = await createTask(request, { title: 'Car service', page_id: seeded.pageId });
    const first = await (
      await request.post(`/api/tasks/${task.id}/checklist`, { data: { text: 'Oil change' } })
    ).json();
    await request.post(`/api/tasks/${task.id}/checklist`, { data: { text: 'Brake pads' } });

    const before = await (await request.get(`/api/tasks/${task.id}`)).json();
    await request.patch(`/api/checklist/${first.item.id}/position`, {
      data: { before_id: null, after_id: null },
    });
    const after = await (await request.get(`/api/tasks/${task.id}`)).json();

    expect(after.updates.map((u: any) => u.body)).toEqual(before.updates.map((u: any) => u.body));
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
