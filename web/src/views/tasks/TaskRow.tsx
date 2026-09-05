import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDate, type Task } from '@kram/shared';
import { StatusChip } from '../../components/StatusChip.js';
import styles from './TaskRow.module.css';

interface Props {
  task: Task;
  pageColour?: string;
  pageName?: string;
  placeName?: string;
  draggable: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: Task['status']) => void;
  onDelete: (task: Task) => void;
}

export function TaskRow({
  task,
  pageColour,
  pageName,
  placeName,
  draggable,
  selected,
  onSelect,
  onStatusChange,
  onDelete,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const isDone = task.status === 'done';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={styles.row}
      data-dragging={isDragging || undefined}
      data-selected={selected || undefined}
      data-done={isDone || undefined}
      data-testid={`task-row-${task.title}`}
      onClick={() => onSelect(task.id)}
    >
      {draggable && (
        <button
          type="button"
          className={styles.handle}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${task.title}`}
          onClick={(event) => event.stopPropagation()}
          data-testid={`drag-handle-${task.title}`}
        >
          <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
            <circle cx="3" cy="4" r="1.3" fill="currentColor" />
            <circle cx="3" cy="8" r="1.3" fill="currentColor" />
            <circle cx="3" cy="12" r="1.3" fill="currentColor" />
            <circle cx="7" cy="4" r="1.3" fill="currentColor" />
            <circle cx="7" cy="8" r="1.3" fill="currentColor" />
            <circle cx="7" cy="12" r="1.3" fill="currentColor" />
          </svg>
        </button>
      )}

      {/* One click completes or reopens — the most common state change gets the
          cheapest interaction (FR-10). */}
      <button
        type="button"
        className={styles.checkbox}
        data-checked={isDone || undefined}
        onClick={(event) => {
          event.stopPropagation();
          onStatusChange(task.id, isDone ? 'todo' : 'done');
        }}
        aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
        data-testid={`complete-${task.title}`}
      >
        {isDone && (
          <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true">
            <path
              d="M2.5 7.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <span className={styles.colour} style={{ background: task.colour }} aria-hidden="true" />

      <span className={styles.title}>{task.title}</span>

      <div className={styles.meta}>
        {(placeName ?? task.location_label) && (
          <span className={styles.location} title={placeName ?? task.location_label ?? ''}>
            <svg viewBox="0 0 12 14" width="10" height="11" aria-hidden="true">
              <path
                d="M6 13S1.5 8.5 1.5 5.5a4.5 4.5 0 019 0C10.5 8.5 6 13 6 13z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <circle cx="6" cy="5.4" r="1.6" fill="currentColor" />
            </svg>
            {placeName ?? task.location_label}
          </span>
        )}

        {pageName && (
          <span className={styles.page}>
            <span className={styles.pageDot} style={{ background: pageColour }} aria-hidden="true" />
            {pageName}
          </span>
        )}

        <span className={styles.date}>{formatDate(task.created_on)}</span>

        <StatusChip
          status={task.status}
          onChange={(status) => onStatusChange(task.id, status)}
        />

        <button
          type="button"
          className={styles.delete}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task);
          }}
          aria-label={`Delete ${task.title}`}
          data-testid={`delete-${task.title}`}
        >
          <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
            <path
              d="M2.5 4h9M5.5 4V2.8h3V4M4 4l.5 7.5h5L10 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </li>
  );
}
