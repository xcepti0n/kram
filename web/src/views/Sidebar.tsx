import { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Page } from '@kram/shared';
import { SidebarPage } from './SidebarPage.js';
import styles from './Sidebar.module.css';

export type ViewKey = { kind: 'overview' } | { kind: 'timeline' } | { kind: 'page'; id: string } | { kind: 'settings' };

interface Props {
  pages: Page[];
  view: ViewKey;
  onNavigate: (view: ViewKey) => void;
  onCreatePage: (name: string) => void;
  onRenamePage: (id: string, name: string) => void;
  onReorderPage: (id: string, before_id: string | null, after_id: string | null) => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  pages,
  view,
  onNavigate,
  onCreatePage,
  onRenamePage,
  onReorderPage,
  open,
  onClose,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* The list settles locally on drop while the write is in flight; the query
     invalidation reconciles it afterwards. */
  const ordered = useMemo(() => {
    if (!localOrder) return pages;
    const byId = new Map(pages.map((p) => [p.id, p]));
    const out = localOrder.map((id) => byId.get(id)).filter((p): p is Page => Boolean(p));
    for (const page of pages) if (!localOrder.includes(page.id)) out.push(page);
    return out;
  }, [pages, localOrder]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = ordered.findIndex((p) => p.id === active.id);
    const to = ordered.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;

    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setLocalOrder(next.map((p) => p.id));

    onReorderPage(String(active.id), next[to - 1]?.id ?? null, next[to + 1]?.id ?? null);
  };

  const isActive = (candidate: ViewKey): boolean => {
    if (candidate.kind !== view.kind) return false;
    if (candidate.kind === 'page' && view.kind === 'page') return candidate.id === view.id;
    return true;
  };

  const submitNew = () => {
    const trimmed = newName.trim();
    if (trimmed) onCreatePage(trimmed);
    setNewName('');
    setCreating(false);
  };

  return (
    <>
      {open && <div className={styles.scrim} onClick={onClose} aria-hidden="true" />}
      <nav
        className={styles.sidebar}
        data-open={open || undefined}
        aria-label="Views and pages"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch) swipeStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = swipeStart.current;
          const touch = event.changedTouches[0];
          swipeStart.current = null;
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = Math.abs(touch.clientY - start.y);
          // A decisive leftward swipe closes it; vertical movement means the
          // user was scrolling the page list instead.
          if (dx < -55 && dy < 45) onClose();
        }}
      >
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <svg viewBox="0 0 20 20" width="17" height="17">
              <path d="M3 6h6M3 10h10M3 14h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="16" cy="6" r="2.2" fill="currentColor" />
            </svg>
          </span>
          Kram
        </div>

        <ul className={styles.group}>
          <li>
            <button
              type="button"
              className={styles.item}
              data-active={isActive({ kind: 'overview' }) || undefined}
              onClick={() => onNavigate({ kind: 'overview' })}
              data-testid="nav-overview"
            >
              <Glyph name="overview" />
              Overview
            </button>
          </li>
          <li>
            <button
              type="button"
              className={styles.item}
              data-active={isActive({ kind: 'timeline' }) || undefined}
              onClick={() => onNavigate({ kind: 'timeline' })}
              data-testid="nav-timeline"
            >
              <Glyph name="timeline" />
              Timeline
            </button>
          </li>
        </ul>

        <div className={styles.sectionHeader}>
          <span>Pages</span>
          <button
            type="button"
            className={styles.addPage}
            onClick={() => setCreating(true)}
            aria-label="New page"
            data-testid="new-page"
          >
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <SortableContext items={ordered.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ul className={styles.group} data-testid="page-list">
              {ordered.map((page) =>
                renaming === page.id ? (
                  <li key={page.id}>
                    <input
                      className={styles.renameInput}
                      value={renameValue}
                      autoFocus
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => {
                        const trimmed = renameValue.trim();
                        if (trimmed && trimmed !== page.name) onRenamePage(page.id, trimmed);
                        setRenaming(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                        else if (event.key === 'Escape') setRenaming(null);
                      }}
                    />
                  </li>
                ) : (
                  <SidebarPage
                    key={page.id}
                    page={page}
                    active={isActive({ kind: 'page', id: page.id })}
                    onNavigate={() => onNavigate({ kind: 'page', id: page.id })}
                    onStartRename={() => {
                      setRenaming(page.id);
                      setRenameValue(page.name);
                    }}
                  />
                ),
              )}
            </ul>
          </SortableContext>
        </DndContext>

        <ul className={styles.group}>
          {creating && (
            <li>
              <input
                className={styles.renameInput}
                value={newName}
                placeholder="Page name"
                autoFocus
                onChange={(event) => setNewName(event.target.value)}
                onBlur={submitNew}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitNew();
                  else if (event.key === 'Escape') {
                    setNewName('');
                    setCreating(false);
                  }
                }}
                data-testid="new-page-input"
              />
            </li>
          )}
        </ul>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.item}
            data-active={isActive({ kind: 'settings' }) || undefined}
            onClick={() => onNavigate({ kind: 'settings' })}
            data-testid="nav-settings"
          >
            <Glyph name="settings" />
            Settings
          </button>
        </div>
      </nav>
    </>
  );
}

function Glyph({ name }: { name: 'overview' | 'timeline' | 'settings' }) {
  const paths = {
    overview: (
      <>
        <rect x="2.5" y="3" width="11" height="3" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <rect x="2.5" y="9" width="11" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
    timeline: (
      <>
        <path d="M2.5 5h7M2.5 11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="6" cy="5" r="1.8" fill="currentColor" />
        <circle cx="10.5" cy="11" r="1.8" fill="currentColor" />
      </>
    ),
    settings: (
      <>
        <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" className={styles.glyph} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
