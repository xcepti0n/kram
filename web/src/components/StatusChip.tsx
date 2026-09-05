/**
 * Status control (FR-4.1). One click opens the menu, a second picks — the
 * two-interaction budget the friction requirement allows.
 *
 * Status is conveyed by label as well as colour, so it never depends on hue
 * alone.
 */
import { useEffect, useRef, useState } from 'react';
import { TASK_STATUSES, type TaskStatus } from '@kram/shared';
import styles from './StatusChip.module.css';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

interface Props {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  size?: 'sm' | 'md';
}

export function StatusChip({ status, onChange, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.chip}
        data-status={status}
        data-size={size}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${STATUS_LABEL[status]}. Change status`}
        data-testid="status-chip"
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>{STATUS_LABEL[status]}</span>
      </button>

      {open && (
        <div className={styles.menu} role="listbox" data-testid="status-menu">
          {TASK_STATUSES.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === status}
              className={styles.option}
              data-status={option}
              data-selected={option === status || undefined}
              onClick={(event) => {
                event.stopPropagation();
                onChange(option);
                setOpen(false);
              }}
              data-testid={`status-option-${option}`}
            >
              <span className={styles.dot} aria-hidden="true" />
              {STATUS_LABEL[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
