/**
 * Task detail, as a side sheet rather than a modal so the surrounding context
 * stays visible (FR-10.4).
 *
 * Every field saves on blur — there are no save buttons (FR-10.3).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatDate,
  PALETTE,
  type Place,
  TASK_STATUSES,
  type StatusEvent,
  type StatusUpdate,
  type TaskStatus,
  type TaskWithChildren,
} from '@kram/shared';
import { DateInput } from '../../components/DateInput.js';
import { PlacePicker, type PlaceWithCount } from '../../components/PlacePicker.js';
import { STATUS_LABEL, StatusChip } from '../../components/StatusChip.js';
import styles from './TaskSheet.module.css';

interface Props {
  task: TaskWithChildren;
  pageName?: string;
  places: PlaceWithCount[];
  onCreatePlace: (name: string, coords?: { lat: number; lng: number }) => Promise<Place>;
  onClose: () => void;
  onUpdate: (input: Record<string, unknown>) => void;
  onStatusChange: (status: TaskStatus, occurred_on?: string) => void;
  onAddUpdate: (body: string, occurred_on: string, status?: TaskStatus) => void;
  onEditUpdate: (id: string, input: { body?: string; occurred_on?: string }) => void;
  onDeleteUpdate: (id: string) => void;
  onEditStatusEvent: (id: string, occurred_on: string) => void;
}

type TimelineEntry =
  | { kind: 'update'; at: string; update: StatusUpdate }
  | { kind: 'event'; at: string; event: StatusEvent };

export function TaskSheet({
  task,
  pageName,
  places,
  onCreatePlace,
  onClose,
  onUpdate,
  onStatusChange,
  onAddUpdate,
  onEditUpdate,
  onDeleteUpdate,
  onEditStatusEvent,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [updateBody, setUpdateBody] = useState('');
  const [updateDate, setUpdateDate] = useState(todayString());
  const [updateStatus, setUpdateStatus] = useState<TaskStatus | ''>('');
  const [editingUpdate, setEditingUpdate] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? '');
  }, [task.id, task.title, task.description]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Notes and state changes are separate rows but one narrative, so the sheet
     interleaves them chronologically (DD-16). */
  const entries = useMemo<TimelineEntry[]>(() => {
    const merged: TimelineEntry[] = [
      ...task.updates.map((update) => ({
        kind: 'update' as const,
        at: update.occurred_on,
        update,
      })),
      ...task.status_events.map((event) => ({
        kind: 'event' as const,
        at: event.occurred_on,
        event,
      })),
    ];
    return merged.sort(
      (a, b) => b.at.localeCompare(a.at) || (a.kind === 'event' ? 1 : -1),
    );
  }, [task.updates, task.status_events]);

  /* Drag-to-dismiss on touch. Only starts when the content is scrolled to the
     top, so pulling down to read never closes the sheet by accident. */
  const onGrabberDown = (event: React.PointerEvent) => {
    if ((scrollRef.current?.scrollTop ?? 0) > 0) return;
    dragStart.current = event.clientY;
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onGrabberMove = (event: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, event.clientY - dragStart.current));
  };

  const onGrabberUp = () => {
    if (dragStart.current === null) return;
    // Past a third of the way down, the gesture reads as "dismiss".
    if (dragY > 120) onClose();
    dragStart.current = null;
    setDragY(0);
  };

  const submitUpdate = () => {
    const trimmed = updateBody.trim();
    if (!trimmed) return;
    onAddUpdate(trimmed, updateDate, updateStatus || undefined);
    setUpdateBody('');
    setUpdateDate(todayString());
    setUpdateStatus('');
  };

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <aside
        className={styles.sheet}
        role="dialog"
        aria-label={task.title}
        data-testid="task-sheet"
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        {/* Touch handle. Hidden on desktop, where the sheet is a side panel. */}
        <div
          className={styles.grabber}
          onPointerDown={onGrabberDown}
          onPointerMove={onGrabberMove}
          onPointerUp={onGrabberUp}
          onPointerCancel={onGrabberUp}
          data-testid="sheet-grabber"
          aria-hidden="true"
        >
          <span />
        </div>
        <header className={styles.header}>
          {pageName && <span className={styles.page}>{pageName}</span>}
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
            data-testid="sheet-close"
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={styles.body} ref={scrollRef}>
          <textarea
            className={styles.title}
            value={title}
            rows={1}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              const trimmed = title.trim();
              if (trimmed && trimmed !== task.title) onUpdate({ title: trimmed });
              else if (!trimmed) setTitle(task.title);
            }}
            aria-label="Task title"
            data-testid="sheet-title"
          />

          <div className={styles.fields}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Status</span>
              <StatusChip status={task.status} onChange={(s) => onStatusChange(s)} size="md" />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Started</span>
              <DateInput
                value={task.created_on}
                onChange={(value) => onUpdate({ created_on: value })}
                inline
                data-testid="sheet-created-on"
              />
            </div>

            {task.completed_on && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Completed</span>
                <span className={styles.fieldValue}>{formatDate(task.completed_on)}</span>
              </div>
            )}

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Colour</span>
              <div className={styles.swatches}>
                {PALETTE.map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    className={styles.swatch}
                    style={{ background: colour }}
                    data-selected={colour.toLowerCase() === task.colour.toLowerCase() || undefined}
                    onClick={() => onUpdate({ colour })}
                    aria-label={`Colour ${colour}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <textarea
            className={styles.description}
            value={description}
            placeholder="Notes about this task…"
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => {
              if (description !== (task.description ?? '')) {
                onUpdate({ description: description || null });
              }
            }}
            aria-label="Description"
            data-testid="sheet-description"
          />

          {/* A place is chosen, not described — see components/PlacePicker (DD-23). */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Place</span>
            <div className={styles.placeField}>
              <PlacePicker
                places={places}
                selectedId={task.place_id}
                onSelect={(place_id) => onUpdate({ place_id })}
                onCreate={onCreatePlace}
              />
            </div>
          </div>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Progress</h3>

            <div className={styles.updateComposer}>
              <textarea
                className={styles.updateInput}
                value={updateBody}
                placeholder="What happened?"
                rows={2}
                onChange={(event) => setUpdateBody(event.target.value)}
                onKeyDown={(event) => {
                  // Enter submits; Shift+Enter adds a line. The common case is
                  // one line, so it gets the single keystroke (FR-3.4).
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitUpdate();
                  }
                }}
                aria-label="New status update"
                data-testid="update-composer"
              />
              <div className={styles.updateControls}>
                <DateInput value={updateDate} onChange={setUpdateDate} inline />
                <select
                  className={styles.statusSelect}
                  value={updateStatus}
                  onChange={(event) => setUpdateStatus(event.target.value as TaskStatus | '')}
                  aria-label="Also change status"
                  data-testid="update-status-select"
                >
                  <option value="">Keep status</option>
                  {TASK_STATUSES.filter((s) => s !== task.status).map((status) => (
                    <option key={status} value={status}>
                      → {STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.updateSubmit}
                  onClick={submitUpdate}
                  disabled={!updateBody.trim()}
                  data-testid="update-submit"
                >
                  Add
                </button>
              </div>
            </div>

            <ol className={styles.entries} data-testid="task-history">
              {entries.length === 0 && <li className={styles.emptyEntry}>No progress recorded yet.</li>}

              {entries.map((entry) =>
                entry.kind === 'update' ? (
                  <li key={entry.update.id} className={styles.entry} data-testid="history-update">
                    <span className={styles.entryDot} style={{ background: task.colour }} />
                    <div className={styles.entryBody}>
                      {editingUpdate === entry.update.id ? (
                        <textarea
                          className={styles.entryEdit}
                          value={editingBody}
                          rows={2}
                          autoFocus
                          onChange={(event) => setEditingBody(event.target.value)}
                          onBlur={() => {
                            const trimmed = editingBody.trim();
                            if (trimmed && trimmed !== entry.update.body) {
                              onEditUpdate(entry.update.id, { body: trimmed });
                            }
                            setEditingUpdate(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              (event.target as HTMLTextAreaElement).blur();
                            } else if (event.key === 'Escape') {
                              setEditingUpdate(null);
                            }
                          }}
                        />
                      ) : (
                        <p
                          className={styles.entryText}
                          onClick={() => {
                            setEditingUpdate(entry.update.id);
                            setEditingBody(entry.update.body);
                          }}
                        >
                          {entry.update.body}
                        </p>
                      )}
                      <div className={styles.entryMeta}>
                        <DateInput
                          value={entry.update.occurred_on}
                          onChange={(value) => onEditUpdate(entry.update.id, { occurred_on: value })}
                          inline
                        />
                        <button
                          type="button"
                          className={styles.entryDelete}
                          onClick={() => onDeleteUpdate(entry.update.id)}
                          aria-label="Delete update"
                          data-testid="delete-update"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ) : (
                  <li key={entry.event.id} className={styles.eventEntry} data-testid="history-event">
                    <span className={styles.eventDot} data-status={entry.event.status} />
                    <span className={styles.eventLabel}>{STATUS_LABEL[entry.event.status]}</span>
                    <DateInput
                      value={entry.event.occurred_on}
                      onChange={(value) => onEditStatusEvent(entry.event.id, value)}
                      inline
                      className={styles.eventDate}
                    />
                  </li>
                ),
              )}
            </ol>
          </section>
        </div>
      </aside>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}
