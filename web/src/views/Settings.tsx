import { useRef, useState } from 'react';
import type { ImportMode, Page, Settings as SettingsType } from '@tasktracker/shared';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.js';
import styles from './Settings.module.css';

interface Props {
  settings: SettingsType;
  pages: Page[];
  onChange: (input: Partial<Omit<SettingsType, 'user_id'>>) => void;
  onImport: (doc: unknown, mode: ImportMode) => void;
  onDeletePage: (id: string, policy: { tasks: 'move'; to: string } | { tasks: 'delete' }) => void;
}

const THEME_OPTIONS = [
  { value: 'calm', label: 'Calm', hint: 'Restrained, generous whitespace' },
  { value: 'bold', label: 'Bold', hint: 'Saturated, heavier, more motion' },
  { value: 'dense', label: 'Dense', hint: 'Compact, maximum on screen' },
] as const;

const MODE_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
] as const;

export function Settings({ settings, pages, onChange, onImport, onDeletePage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [pendingPage, setPendingPage] = useState<string | null>(null);
  const toast = useToast();

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const doc: unknown = JSON.parse(text);
      onImport(doc, importMode);
    } catch {
      toast.show('That file is not valid JSON', 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.heading}>Appearance</h2>
        <p className={styles.description}>
          A theme changes how the app is laid out, not only its colours — spacing, type scale and the
          timeline's own geometry all follow.
        </p>

        <div className={styles.themeGrid}>
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.themeCard}
              data-selected={settings.theme === option.value || undefined}
              onClick={() => onChange({ theme: option.value })}
              data-testid={`theme-${option.value}`}
            >
              <ThemePreview variant={option.value} />
              <span className={styles.themeName}>{option.label}</span>
              <span className={styles.themeHint}>{option.hint}</span>
            </button>
          ))}
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Colour mode</span>
          <div className={styles.segmented} role="group">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.segment}
                data-active={settings.mode === option.value || undefined}
                onClick={() => onChange({ mode: option.value })}
                data-testid={`mode-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Density</span>
          <div className={styles.segmented} role="group">
            {DENSITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.segment}
                data-active={settings.density === option.value || undefined}
                onClick={() => onChange({ density: option.value })}
                data-testid={`density-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Completed tasks</span>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={settings.hide_done}
              onChange={(event) => onChange({ hide_done: event.target.checked })}
              data-testid="hide-done"
            />
            Hide them in lists and the timeline
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Pages</h2>
        <p className={styles.description}>
          Deleting a page always asks what happens to its tasks — they are never silently destroyed.
        </p>
        <ul className={styles.pageList}>
          {pages.map((page) => (
            <li key={page.id} className={styles.pageItem}>
              <span className={styles.pageDot} style={{ background: page.colour }} />
              <span className={styles.pageName}>{page.name}</span>
              {pages.length > 1 &&
                (pendingPage === page.id ? (
                  <span className={styles.pagePolicy}>
                    <span className={styles.policyLabel}>Its tasks:</span>
                    <select
                      className={styles.policySelect}
                      defaultValue=""
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) return;
                        if (value === 'delete') onDeletePage(page.id, { tasks: 'delete' });
                        else onDeletePage(page.id, { tasks: 'move', to: value });
                        setPendingPage(null);
                      }}
                      data-testid={`delete-policy-${page.name}`}
                    >
                      <option value="">Choose…</option>
                      {pages
                        .filter((p) => p.id !== page.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            Move to {p.name}
                          </option>
                        ))}
                      <option value="delete">Delete them too</option>
                    </select>
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => setPendingPage(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => setPendingPage(page.id)}
                    data-testid={`delete-page-${page.name}`}
                  >
                    Delete
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Your data</h2>
        <p className={styles.description}>
          Everything exports as one readable JSON file — a backup that does not depend on the server,
          and a way out if you ever move off this app.
        </p>

        <div className={styles.dataRow}>
          <a
            className={styles.button}
            href={api.exportUrl()}
            download
            data-testid="export-button"
          >
            Export everything
          </a>
          <a className={styles.textButton} href={api.exportUrl(true)} download>
            Include deleted
          </a>
        </div>

        <div className={styles.dataRow}>
          <select
            className={styles.policySelect}
            value={importMode}
            onChange={(event) => setImportMode(event.target.value as ImportMode)}
            aria-label="Import mode"
            data-testid="import-mode"
          >
            <option value="merge">Merge — add what is missing</option>
            <option value="duplicate">Duplicate — copy in under new ids</option>
            <option value="replace">Replace — wipe and restore</option>
          </select>
          <button
            type="button"
            className={styles.button}
            onClick={() => fileRef.current?.click()}
            data-testid="import-button"
          >
            Import a file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className={styles.fileInput}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            data-testid="import-file"
          />
        </div>

        {importMode === 'replace' && (
          <p className={styles.warning}>
            Replace deletes everything first. A backup of the current data is written to
            <code> data/backups/</code> before anything changes.
          </p>
        )}
      </section>
    </div>
  );
}

/** A miniature of the theme's character — rows and a timeline fragment — so the
 *  choice is made by looking rather than by reading. */
function ThemePreview({ variant }: { variant: 'calm' | 'bold' | 'dense' }) {
  const config = {
    calm: { gap: 5, height: 6, radius: 3, line: 2.5, dot: 3 },
    bold: { gap: 6, height: 9, radius: 5, line: 4, dot: 4.5 },
    dense: { gap: 2.5, height: 3.5, radius: 1.5, line: 1.5, dot: 2 },
  }[variant];

  return (
    <svg viewBox="0 0 108 52" className={styles.preview} aria-hidden="true">
      {[0, 1, 2].map((i) => {
        const y = 8 + i * (config.height + config.gap);
        return (
          <g key={i}>
            <rect
              x="6"
              y={y}
              width="26"
              height={config.height}
              rx={config.radius}
              className={styles.previewBar}
            />
            <line
              x1="38"
              y1={y + config.height / 2}
              x2={72 + i * 10}
              y2={y + config.height / 2}
              strokeWidth={config.line}
              strokeLinecap="round"
              className={styles.previewLine}
              data-index={i}
            />
            <circle
              cx={52 + i * 6}
              cy={y + config.height / 2}
              r={config.dot}
              className={styles.previewDot}
              data-index={i}
            />
          </g>
        );
      })}
    </svg>
  );
}
