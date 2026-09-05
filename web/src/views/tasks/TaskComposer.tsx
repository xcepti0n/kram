/**
 * Inline task composer, permanently present at the foot of every list (FR-10.2).
 *
 * Type a title, press Enter, done — and the field stays focused so several tasks
 * can be captured in a row without reaching for the mouse.
 */
import { useRef, useState } from 'react';
import styles from './TaskComposer.module.css';

interface Props {
  onCreate: (title: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function TaskComposer({ onCreate, placeholder, autoFocus }: Props) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setTitle('');
    inputRef.current?.focus();
  };

  return (
    <div className={styles.composer}>
      <span className={styles.plus} aria-hidden="true">
        <svg viewBox="0 0 14 14" width="13" height="13">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={title}
        placeholder={placeholder ?? 'Add a task'}
        autoFocus={autoFocus}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            setTitle('');
            inputRef.current?.blur();
          }
        }}
        aria-label="New task title"
        data-testid="task-composer"
      />
      {title.trim() && (
        <button type="button" className={styles.submit} onClick={submit}>
          Add
        </button>
      )}
    </div>
  );
}
