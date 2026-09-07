/**
 * URL <-> app state (DD-35).
 *
 * The app had no routing at all: `view` was useState, so a refresh always
 * landed on Overview and nothing was linkable. The server already serves
 * index.html for unknown non-API paths, so this is purely a client concern.
 *
 * No router library. `ViewKey` is a four-case discriminated union and the task
 * sheet is a single id — the whole mapping is the two functions below, which is
 * less code than configuring a router and keeps the union as the source of
 * truth rather than a second copy of the routes.
 *
 * A task is an *overlay*, not a view: it opens on top of whichever list you
 * were looking at. So it is a query parameter rather than a path segment —
 * /p/abc?task=xyz keeps the page in the URL, where /t/xyz would lose it and
 * make closing the sheet guess where to return to.
 */
import type { ViewKey } from './views/Sidebar.js';

export interface Route {
  view: ViewKey;
  taskId: string | null;
}

/** A stray `%` in a hand-typed URL throws; treat it as a literal rather than
 *  letting it take down the whole app on mount. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Parse a pathname + search into app state. Unknown paths fall back to overview. */
export function parseRoute(pathname: string, search: string): Route {
  const taskId = new URLSearchParams(search).get('task');
  const segments = pathname.split('/').filter(Boolean);

  const view = ((): ViewKey => {
    if (segments.length === 0) return { kind: 'overview' };
    if (segments[0] === 'timeline') return { kind: 'timeline' };
    if (segments[0] === 'settings') return { kind: 'settings' };
    // The id is not validated here: a page that does not exist is a render-time
    // concern, and the view still has to resolve for the app to mount.
    // decodeURIComponent to match routeToPath's encoding. URLSearchParams
    // decodes the task id for us, but a path segment is raw.
    if (segments[0] === 'p' && segments[1]) {
      return { kind: 'page', id: safeDecode(segments[1]) };
    }
    return { kind: 'overview' };
  })();

  return { view, taskId: taskId && taskId.length > 0 ? taskId : null };
}

/** Build the path for a route. Inverse of parseRoute for every reachable state. */
export function routeToPath(route: Route): string {
  const base =
    route.view.kind === 'overview'
      ? '/'
      : route.view.kind === 'timeline'
        ? '/timeline'
        : route.view.kind === 'settings'
          ? '/settings'
          : `/p/${encodeURIComponent(route.view.id)}`;

  return route.taskId ? `${base}?task=${encodeURIComponent(route.taskId)}` : base;
}
