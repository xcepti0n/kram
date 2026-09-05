import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildSegments, fitRange, rangeFor, type DateRange } from './views/timeline/geometry.js';
import {
  SORT_MODES,
  today,
  type SortMode,
  type Task,
  type TaskStatus,
} from '@kram/shared';
import {
  useAddUpdate,
  useChangeStatus,
  useCreatePage,
  useCreatePlace,
  useCreateTask,
  useDeletePage,
  useDeleteTask,
  useDeleteUpdate,
  useEditStatusEvent,
  useEditUpdate,
  useImport,
  usePages,
  usePlaces,
  useRepositionPage,
  useRepositionTask,
  useSettings,
  useTask,
  useTasks,
  useTimeline,
  useUpdatePage,
  useUpdateSettings,
  useUpdateTask,
} from './api/hooks.js';
import { Sidebar, type ViewKey } from './views/Sidebar.js';
import { TaskList } from './views/tasks/TaskList.js';
import { TaskSheet } from './views/tasks/TaskSheet.js';
import { Timeline } from './views/timeline/Timeline.js';
import { Settings } from './views/Settings.js';
import { TaskComposer } from './views/tasks/TaskComposer.js';
import styles from './App.module.css';

/* Not named for the product: a rename must not reset everyone's theme. */
const SETTINGS_KEY = 'app.settings';

const SORT_LABEL: Record<SortMode, string> = {
  manual: 'My order',
  created: 'Oldest first',
  status: 'Needs attention',
  title: 'A–Z',
};

export function App() {
  const [view, setView] = useState<ViewKey>({ kind: 'overview' });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('manual');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  // Null until the data arrives, so the first render can frame the real span
  // rather than an arbitrary window the user then has to zoom out of.
  const [range, setRange] = useState<DateRange | null>(null);

  const pagesQuery = usePages();
  const placesQuery = usePlaces();
  const settingsQuery = useSettings();
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const settings = settingsQuery.data;

  const hideDone = settings?.hide_done ?? false;
  const pageId = view.kind === 'page' ? view.id : undefined;

  const tasksQuery = useTasks({
    page_id: pageId,
    include_done: hideDone ? false : undefined,
    sort,
  });
  // Ask for a generous window; the view frames a subset of it locally, so
  // panning and zooming do not each cost a request.
  const timelineQuery = useTimeline({
    from: range ? range.from : undefined,
    to: range ? range.to : undefined,
    page_ids: view.kind === 'page' ? view.id : undefined,
    include_done: hideDone ? false : undefined,
  });
  const selectedTask = useTask(selectedTaskId);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const changeStatus = useChangeStatus();
  const deleteTask = useDeleteTask();
  const repositionTask = useRepositionTask();
  const addUpdate = useAddUpdate();
  const editUpdate = useEditUpdate();
  const deleteUpdate = useDeleteUpdate();
  const editStatusEvent = useEditStatusEvent();
  const createPage = useCreatePage();
  const repositionPage = useRepositionPage();
  const createPlace = useCreatePlace();
  const updatePage = useUpdatePage();
  const deletePage = useDeletePage();
  const updateSettings = useUpdateSettings();
  const importData = useImport();

  /* Theme attributes are mirrored to <html> and localStorage, so the pre-paint
     script in index.html can apply them before React runs (FR-9.4). */
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.mode = settings.mode;
    root.dataset.density = settings.density;
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ theme: settings.theme, mode: settings.mode, density: settings.density }),
      );
    } catch {
      /* private mode, or storage disabled */
    }
  }, [settings]);

  /* `C` opens the quick composer from anywhere — the single keystroke the
     friction requirement asks for (FR-10.1). */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      if (typing) return;

      if ((event.key === 'c' || event.key === 'C') && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setQuickOpen(true);
      } else if (event.key === 'Escape') {
        setQuickOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Frame the data the first time it arrives. Afterwards the user's own pan and
     zoom is authoritative, so this does not fight them. */
  const timelineData = timelineQuery.data;
  useEffect(() => {
    if (range !== null || !timelineData) return;
    const todayDate = today();
    const spans = timelineData.tasks.map((task) => {
      const segments = buildSegments(task, todayDate);
      return {
        from: segments[0]?.from ?? task.created_on,
        to: segments[segments.length - 1]?.to ?? todayDate,
      };
    });
    setRange(fitRange(spans, todayDate));
  }, [timelineData, range]);

  const currentPage = view.kind === 'page' ? pages.find((p) => p.id === view.id) : undefined;

  const handleCreate = useCallback(
    (title: string, targetPage?: string) => {
      createTask.mutate({ title, page_id: targetPage ?? pageId ?? pages[0]?.id });
    },
    [createTask, pageId, pages],
  );

  const handleReorder = useCallback(
    (id: string, before_id: string | null, after_id: string | null) => {
      repositionTask.mutate({ id, before_id, after_id });
    },
    [repositionTask],
  );

  const handleStatus = useCallback(
    (id: string, status: TaskStatus) => changeStatus.mutate({ id, status }),
    [changeStatus],
  );

  const handleDelete = useCallback(
    (task: Task) => {
      if (task.id === selectedTaskId) setSelectedTaskId(null);
      deleteTask.mutate(task);
    },
    [deleteTask, selectedTaskId],
  );

  const tasks = tasksQuery.data ?? [];

  /* Overview groups by page (FR-6.5): a flat merged list loses the context that
     makes a task meaningful, and context is the whole point of pages. */
  const grouped = useMemo(() => {
    if (view.kind !== 'overview') return [];
    return pages
      .map((page) => ({ page, tasks: tasks.filter((t) => t.page_id === page.id) }))
      .filter((group) => group.tasks.length > 0);
  }, [view.kind, pages, tasks]);

  const title =
    view.kind === 'overview'
      ? 'Overview'
      : view.kind === 'timeline'
        ? 'Timeline'
        : view.kind === 'settings'
          ? 'Settings'
          : (currentPage?.name ?? 'Page');

  return (
    <div className={styles.shell}>
      <Sidebar
        pages={pages}
        view={view}
        onNavigate={(next) => {
          setView(next);
          setSidebarOpen(false);
        }}
        onCreatePage={(name) => createPage.mutate(name)}
        onRenamePage={(id, name) => updatePage.mutate({ id, name })}
        onReorderPage={(id, before_id, after_id) =>
          repositionPage.mutate({ id, before_id, after_id })
        }
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className={styles.main}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <h1 className={styles.title}>{title}</h1>

          {(view.kind === 'page' || view.kind === 'overview') && (
            <div className={styles.headerActions}>
              <select
                className={styles.sortSelect}
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                aria-label="Sort tasks"
                data-testid="sort-select"
              >
                {SORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {SORT_LABEL[mode]}
                  </option>
                ))}
              </select>
              {sort !== 'manual' && (
                <span className={styles.sortNote} title="Drag to reorder is only available in your own order">
                  drag off
                </span>
              )}
            </div>
          )}
        </header>

        <div className={styles.content}>
          {view.kind === 'timeline' && timelineQuery.data && (
            <Timeline
              data={timelineQuery.data}
              groupByPage
              range={range ?? rangeFor('week', today())}
              onRangeChange={setRange}
              onSelectTask={setSelectedTaskId}
            />
          )}

          {view.kind === 'page' && (
            <div className={styles.scroller}>
              <TaskList
                tasks={tasks}
                pages={pages}
                places={placesQuery.data ?? []}
                sort={sort}
                selectedId={selectedTaskId}
                onSelect={setSelectedTaskId}
                onStatusChange={handleStatus}
                onDelete={handleDelete}
                onReorder={handleReorder}
                onCreate={(title) => handleCreate(title)}
                composerPlaceholder={`Add a task to ${currentPage?.name ?? 'this page'}`}
              />
            </div>
          )}

          {view.kind === 'overview' && (
            <div className={styles.scroller}>
              {grouped.length === 0 && (
                <p className={styles.empty}>
                  Nothing yet. Press <kbd>C</kbd> to add your first task.
                </p>
              )}
              {grouped.map(({ page, tasks: pageTasks }) => (
                <section key={page.id} className={styles.group}>
                  <button
                    type="button"
                    className={styles.groupHeader}
                    onClick={() => setView({ kind: 'page', id: page.id })}
                    data-testid={`overview-group-${page.name}`}
                  >
                    <span className={styles.groupDot} style={{ background: page.colour }} />
                    {page.name}
                    <span className={styles.groupCount}>
                      {pageTasks.filter((t) => t.status !== 'done').length} open
                    </span>
                  </button>
                  <TaskList
                    tasks={pageTasks}
                    pages={pages}
                    places={placesQuery.data ?? []}
                    sort={sort}
                    selectedId={selectedTaskId}
                    onSelect={setSelectedTaskId}
                    onStatusChange={handleStatus}
                    onDelete={handleDelete}
                    onReorder={handleReorder}
                    onCreate={(title) => handleCreate(title, page.id)}
                    composerPlaceholder={`Add to ${page.name}`}
                  />
                </section>
              ))}
            </div>
          )}

          {view.kind === 'settings' && settings && (
            <div className={styles.scroller}>
              <Settings
                settings={settings}
                pages={pages}
                onChange={(input) => updateSettings.mutate(input)}
                onImport={(doc, mode) => importData.mutate({ doc, mode })}
                onDeletePage={(id, policy) => {
                  deletePage.mutate({ id, policy });
                  if (view.kind === 'settings') setView({ kind: 'overview' });
                }}
              />
            </div>
          )}
        </div>
      </main>

      {selectedTask.data && (
        <TaskSheet
          task={selectedTask.data}
          pageName={pages.find((p) => p.id === selectedTask.data!.page_id)?.name}
          places={placesQuery.data ?? []}
          onCreatePlace={(name, coords) =>
            createPlace.mutateAsync({ name, lat: coords?.lat, lng: coords?.lng })
          }
          onClose={() => setSelectedTaskId(null)}
          onUpdate={(input) => updateTask.mutate({ id: selectedTask.data!.id, input })}
          onStatusChange={(status, occurred_on) =>
            changeStatus.mutate({ id: selectedTask.data!.id, status, occurred_on })
          }
          onAddUpdate={(body, occurred_on, status) =>
            addUpdate.mutate({
              taskId: selectedTask.data!.id,
              input: { body, occurred_on, status },
            })
          }
          onEditUpdate={(id, input) => editUpdate.mutate({ id, input })}
          onDeleteUpdate={(id) => deleteUpdate.mutate(id)}
          onEditStatusEvent={(id, occurred_on) => editStatusEvent.mutate({ id, occurred_on })}
        />
      )}

      {quickOpen && (
        <div className={styles.quickScrim} onClick={() => setQuickOpen(false)}>
          <div
            className={styles.quick}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Quick add task"
          >
            <TaskComposer
              autoFocus
              placeholder="What needs doing?"
              onCreate={(title) => {
                handleCreate(title);
                setQuickOpen(false);
              }}
            />
            <p className={styles.quickHint}>
              Adds to {currentPage?.name ?? pages[0]?.name ?? 'your first page'} · Esc to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
