/**
 * The app's single source of navigation state, backed by the URL.
 *
 * Reads the current URL on mount, listens for popstate (back/forward), and
 * pushes a history entry when the app navigates. Deliberately not a context:
 * App already threads `view` and `selectedTaskId` down as props, and turning
 * navigation into a context would be a bigger change than the bug warrants.
 */
import { useCallback, useEffect, useState } from 'react';
import { parseRoute, routeToPath, type Route } from './routing.js';
import type { ViewKey } from './views/Sidebar.js';

export function useRoute() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search),
  );

  // Back and forward. The URL is already updated by the time this fires, so
  // this reads it rather than using the event's state — that keeps a
  // hand-edited URL and a history entry on the same path.
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname, window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: Route, replace = false) => {
    const path = routeToPath(next);
    // Guard against pushing a duplicate entry: without this, clicking the
    // already-active page in the sidebar would stack entries that all look
    // identical, and the back button would appear stuck.
    if (path !== window.location.pathname + window.location.search) {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    }
    setRoute(next);
  }, []);

  const setView = useCallback(
    (view: ViewKey) => {
      // Changing view closes an open task: the sheet belongs to the list
      // behind it, so carrying it across would show a task from another page.
      go({ view, taskId: null });
    },
    [go],
  );

  const setTaskId = useCallback(
    (taskId: string | null) => {
      // Keeps the current view, so closing the sheet returns to the same list.
      //
      // Reads `route` from the closure rather than using a functional update:
      // pushing history inside a setState updater misfires, because React runs
      // updaters during render and calls them twice under StrictMode. The
      // updater has to stay pure, so the navigation happens out here.
      go({ view: route.view, taskId });
    },
    [go, route.view],
  );

  return { view: route.view, taskId: route.taskId, setView, setTaskId, go };
}
