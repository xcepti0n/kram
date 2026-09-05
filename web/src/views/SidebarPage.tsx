import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Page } from '@kram/shared';
import styles from './Sidebar.module.css';

interface Props {
  page: Page;
  active: boolean;
  onNavigate: () => void;
  onStartRename: () => void;
}

/** A draggable page in the sidebar. Pages carry a `position` exactly as tasks
 *  do, so the same neighbour-id reorder applies (FR-6.2). */
export function SidebarPage({ page, active, onNavigate, onStartRename }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-dragging={isDragging || undefined}
      className={styles.pageItem}
    >
      <button
        type="button"
        className={styles.item}
        data-active={active || undefined}
        onClick={onNavigate}
        onDoubleClick={onStartRename}
        data-testid={`nav-page-${page.name}`}
      >
        <span className={styles.dot} style={{ background: page.colour }} aria-hidden="true" />
        <span className={styles.itemLabel}>{page.name}</span>
      </button>
      <button
        type="button"
        className={styles.pageHandle}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${page.name}`}
        data-testid={`page-handle-${page.name}`}
      >
        <svg viewBox="0 0 10 16" width="9" height="14" aria-hidden="true">
          <circle cx="3" cy="4" r="1.2" fill="currentColor" />
          <circle cx="3" cy="8" r="1.2" fill="currentColor" />
          <circle cx="3" cy="12" r="1.2" fill="currentColor" />
          <circle cx="7" cy="4" r="1.2" fill="currentColor" />
          <circle cx="7" cy="8" r="1.2" fill="currentColor" />
          <circle cx="7" cy="12" r="1.2" fill="currentColor" />
        </svg>
      </button>
    </li>
  );
}
