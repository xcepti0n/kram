/**
 * The checklist on a task (DD-36).
 *
 * Sits between the task's fields and its Progress history, because that is what
 * it is: the parts of the task, not a record of it. Ticking an item writes the
 * day's summary into the history below, so the two read as one story.
 */
import { useEffect, useRef, useState } from 'react';
import type { ChecklistItem } from '@kram/shared';
import styles from './Checklist.module.css';

interface Props {
  items: ChecklistItem[];
  onAdd: (text: string) => void;
  onToggle: (id: string, checked: boolean) => void;
  onRename: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

export function Checklist({ items, onAdd, onToggle, onRename, onRemove, onReset }: Props) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const checked = items.filter((item) => item.checked_on !== null).length;
  const total = items.length;
  const allDone = total > 0 && checked === total;

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft('');
    // Keep focus for the next item: a list is entered in a run, not one at a
    // time with a click in between.
    inputRef.current?.focus();
  };

  const commitRename = (item: ChecklistItem) => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== item.text) onRename(item.id, trimmed);
    setEditing(null);
  };

  // Reset is destructive enough to confirm, but a stuck confirm state is worse
  // than the risk — it clears itself.
  useEffect(() => {
    if (!confirmingReset) return;
    const timer = setTimeout(() => setConfirmingReset(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingReset]);

  return (
    <section className={styles.checklist} data-testid="checklist">
      <div className={styles.header}>
        <h3 className={styles.title}>Checklist</h3>

        {total > 0 && (
          <span
            className={styles.count}
            data-complete={allDone || undefined}
            data-testid="checklist-count"
          >
            {checked}/{total}
          </span>
        )}

        {/* Only offered once something is ticked: on a fresh list it would do
            nothing, and on a one-off list it is never needed. */}
        {checked > 0 && (
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              if (confirmingReset) {
                onReset();
                setConfirmingReset(false);
              } else {
                setConfirmingReset(true);
              }
            }}
            data-testid="checklist-reset"
          >
            {confirmingReset ? 'Clear all ticks?' : 'Reset'}
          </button>
        )}
      </div>

      {total > 0 && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuenow={checked}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${checked} of ${total} done`}
        >
          <div className={styles.progressFill} style={{ inlineSize: `${(checked / total) * 100}%` }} />
        </div>
      )}

      <ul className={styles.items}>
        {items.map((item) => {
          const isChecked = item.checked_on !== null;
          return (
            <li key={item.id} className={styles.item} data-checked={isChecked || undefined}>
              {/* The 44px target lives on the label, not on the input's own
                  ::after: an overlay on the input swallows the very clicks it
                  is meant to enlarge. A label forwards them natively. */}
              <label className={styles.checkboxTarget}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={isChecked}
                  onChange={(event) => onToggle(item.id, event.target.checked)}
                  aria-label={item.text}
                />
              </label>

              {editing === item.id ? (
                <input
                  className={styles.editInput}
                  value={editText}
                  autoFocus
                  data-testid="checklist-edit"
                  aria-label={`Rename ${item.text}`}
                  onChange={(event) => setEditText(event.target.value)}
                  onBlur={() => commitRename(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    // Escape abandons the edit; it must not also close the
                    // sheet, which listens for Escape on window.
                    else if (event.key === 'Escape') {
                      event.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.text}
                  onClick={() => {
                    setEditing(item.id);
                    setEditText(item.text);
                  }}
                >
                  {item.text}
                </button>
              )}

              {/* The date is the answer to "when did I buy this", so it is on
                  the item rather than hidden in the history below. */}
              {isChecked && <time className={styles.date}>{formatDay(item.checked_on!)}</time>}

              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.text}`}
              >
                <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
                  <path
                    d="M3.5 3.5l7 7M10.5 3.5l-7 7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>

      <input
        ref={inputRef}
        className={styles.add}
        value={draft}
        placeholder={total === 0 ? 'Add the first item…' : 'Add an item…'}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape' && draft) {
            // Clear the draft rather than closing the sheet out from under it.
            event.stopPropagation();
            setDraft('');
          }
        }}
        onBlur={submit}
        aria-label="Add a checklist item"
        data-testid="checklist-add"
      />
    </section>
  );
}

/** "3 Sep" — enough to answer "when", short enough to sit on the row. */
function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
