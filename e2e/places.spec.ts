import { createTask, expect, ready, test } from './fixtures.js';

/**
 * Places (DD-23). The interaction is choose-not-describe: filter what you have,
 * create only when nothing matches.
 */
test.describe('places', () => {
  test('creates a place from the picker and attaches it', async ({ page, request, seeded }) => {
    await createTask(request, { title: 'Print the forms' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Print the forms').click();

    await page.getByTestId('place-trigger').click();
    await page.getByTestId('place-search').fill('Office');
    await page.getByTestId('place-create').click();

    await expect(page.getByTestId('place-trigger')).toContainText('Office');

    const places = await (await page.request.get('/api/places')).json();
    expect(places.map((p: any) => p.name)).toEqual(['Office']);
  });

  test('reuses a place across tasks rather than retyping it', async ({
    page,
    request,
    seeded,
  }) => {
    await request.post('/api/places', { data: { name: 'Hardware store' } });
    await createTask(request, { title: 'Buy screws' });
    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Buy screws').click();

    await page.getByTestId('place-trigger').click();
    // The place is offered without typing — that is the whole point.
    await page.getByTestId('place-option-Hardware store').click();

    await expect(page.getByTestId('place-trigger')).toContainText('Hardware store');
    const places = await (await page.request.get('/api/places')).json();
    expect(places).toHaveLength(1);
  });

  test('filters the list as you type', async ({ page, request, seeded }) => {
    await request.post('/api/places', { data: { name: 'Office' } });
    await request.post('/api/places', { data: { name: 'Hardware store' } });
    await createTask(request, { title: 'Somewhere' });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Somewhere').click();

    await page.getByTestId('place-trigger').click();
    await expect(page.getByTestId('place-option-Office')).toBeVisible();

    await page.getByTestId('place-search').fill('hard');
    await expect(page.getByTestId('place-option-Office')).toBeHidden();
    await expect(page.getByTestId('place-option-Hardware store')).toBeVisible();
  });

  test('shows the place on the task row', async ({ page, request, seeded }) => {
    const place = await (
      await request.post('/api/places', { data: { name: 'Office' } })
    ).json();
    await createTask(request, { title: 'At work', place_id: place.id });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();

    await expect(page.getByTestId('task-row-At work')).toContainText('Office');
  });

  test('removes a place from a task', async ({ page, request, seeded }) => {
    const place = await (
      await request.post('/api/places', { data: { name: 'Office' } })
    ).json();
    const task = await createTask(request, { title: 'Detach me', place_id: place.id });

    await page.goto('/');
    await ready(page);
    await page.getByTestId('nav-page-Test Page').click();
    await page.getByTestId('task-row-Detach me').click();

    await page.getByTestId('place-clear').click();
    await expect
      .poll(async () => {
        const detail = await (await page.request.get(`/api/tasks/${task.id}`)).json();
        return detail.place_id;
      })
      .toBeNull();
  });
});
