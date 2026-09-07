/**
 * The URL mapping (DD-35).
 *
 * Hand-rolled routing earns its tests at the boundaries: the round trip has to
 * be lossless for every reachable state, or a refresh silently lands somewhere
 * other than where the user was — which is the bug this replaced.
 */
import { describe, expect, it } from 'vitest';
import { parseRoute, routeToPath, type Route } from './routing.js';

const ROUTES: Route[] = [
  { view: { kind: 'overview' }, taskId: null },
  { view: { kind: 'timeline' }, taskId: null },
  { view: { kind: 'settings' }, taskId: null },
  { view: { kind: 'page', id: 'page-1' }, taskId: null },
  { view: { kind: 'overview' }, taskId: 'task-1' },
  { view: { kind: 'timeline' }, taskId: 'task-1' },
  { view: { kind: 'page', id: 'page-1' }, taskId: 'task-1' },
];

describe('routing', () => {
  it.each(ROUTES)('round-trips $view.kind (task: $taskId)', (route) => {
    const path = routeToPath(route);
    const [pathname, search] = path.split('?');
    expect(parseRoute(pathname!, search ? `?${search}` : '')).toEqual(route);
  });

  it('maps the known paths', () => {
    expect(parseRoute('/', '').view).toEqual({ kind: 'overview' });
    expect(parseRoute('/timeline', '').view).toEqual({ kind: 'timeline' });
    expect(parseRoute('/settings', '').view).toEqual({ kind: 'settings' });
    expect(parseRoute('/p/abc', '').view).toEqual({ kind: 'page', id: 'abc' });
  });

  it('tolerates a trailing slash', () => {
    expect(parseRoute('/settings/', '').view).toEqual({ kind: 'settings' });
    expect(parseRoute('/p/abc/', '').view).toEqual({ kind: 'page', id: 'abc' });
  });

  /* An unrecognised path must render the app, not a blank screen: the server
     answers any non-API path with index.html, so this is where a typo lands. */
  it('falls back to overview for unknown paths', () => {
    expect(parseRoute('/nope', '').view).toEqual({ kind: 'overview' });
    expect(parseRoute('/p', '').view).toEqual({ kind: 'overview' });
  });

  it('treats an empty task parameter as no task', () => {
    expect(parseRoute('/', '?task=').taskId).toBeNull();
  });

  /* Ids come from the database and are uuid-shaped today, but the encoding has
     to hold if that ever changes — a raw ? or & would truncate the URL. */
  it('encodes ids that need it', () => {
    const path = routeToPath({ view: { kind: 'page', id: 'a b&c' }, taskId: 'x?y' });
    const [pathname, search] = path.split('?');
    expect(parseRoute(pathname!, `?${search}`)).toEqual({
      view: { kind: 'page', id: 'a b&c' },
      taskId: 'x?y',
    });
  });
});
