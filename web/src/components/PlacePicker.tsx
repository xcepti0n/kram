/**
 * Place picker (DD-23).
 *
 * A place is somewhere you return to, so the interaction is *choose*, not
 * *describe*: type to filter what you already have, and only fall through to
 * creating one when nothing matches. "Use where I am" saves the current
 * position, which is both simpler and more accurate than geocoding an address
 * you are standing in (DD-24).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '@kram/shared';
import styles from './PlacePicker.module.css';

export interface PlaceWithCount extends Place {
  task_count: number;
}

interface Props {
  places: PlaceWithCount[];
  selectedId: string | null;
  onSelect: (placeId: string | null) => void;
  onCreate: (name: string, coords?: { lat: number; lng: number }) => Promise<Place> | void;
}

export function PlacePicker({ places, selectedId, onSelect, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = places.find((p) => p.id === selectedId) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? places.filter((p) => p.name.toLowerCase().includes(q)) : places;
    // Most-used first: the place you attach tasks to most is the one you want.
    return [...list].sort((a, b) => b.task_count - a.task_count || a.name.localeCompare(b.name));
  }, [places, query]);

  const exactMatch = matches.some((p) => p.name.toLowerCase() === query.trim().toLowerCase());
  const canCreate = query.trim().length > 0 && !exactMatch;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  const choose = (place: Place) => {
    onSelect(place.id);
    setOpen(false);
  };

  const createFromQuery = async () => {
    const name = query.trim();
    if (!name) return;
    const created = await onCreate(name);
    if (created) onSelect(created.id);
    setOpen(false);
  };

  /** Save the current position. Permission is asked for here, on an explicit
   *  action, never on load. */
  const useCurrentPosition = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        };
        const name = query.trim() || 'Here';
        const created = await onCreate(name, coords);
        if (created) onSelect(created.id);
        setLocating(false);
        setOpen(false);
      },
      () => setLocating(false),
      { timeout: 10_000, enableHighAccuracy: true },
    );
  };

  const options = canCreate ? matches.length + 1 : matches.length;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, options - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlight < matches.length) {
        const place = matches[highlight];
        if (place) choose(place);
      } else if (canCreate) {
        void createFromQuery();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {!open ? (
        <div className={styles.selectedRow}>
          <button
            type="button"
            className={styles.trigger}
            data-empty={!selected || undefined}
            onClick={() => setOpen(true)}
            data-testid="place-trigger"
          >
            <PinIcon />
            {selected ? selected.name : 'Add a place'}
            {selected?.lat != null && <span className={styles.hasCoords} title="Has coordinates" />}
          </button>
          {selected && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => onSelect(null)}
              aria-label="Remove place"
              data-testid="place-clear"
            >
              <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true">
                <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <div className={styles.picker}>
          <div className={styles.searchRow}>
            <PinIcon />
            <input
              ref={inputRef}
              type="text"
              className={styles.search}
              value={query}
              placeholder="Find or name a place…"
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              aria-label="Find or name a place"
              data-testid="place-search"
            />
          </div>

          <div className={styles.options} role="listbox">
            {matches.map((place, index) => (
              <button
                key={place.id}
                type="button"
                role="option"
                aria-selected={place.id === selectedId}
                className={styles.option}
                data-highlighted={index === highlight || undefined}
                data-selected={place.id === selectedId || undefined}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(place)}
                data-testid={`place-option-${place.name}`}
              >
                <PinIcon />
                <span className={styles.optionName}>{place.name}</span>
                {place.lat != null && <span className={styles.hasCoords} title="Has coordinates" />}
                {place.task_count > 0 && (
                  <span className={styles.optionCount}>{place.task_count}</span>
                )}
              </button>
            ))}

            {canCreate && (
              <button
                type="button"
                className={styles.option}
                data-highlighted={highlight === matches.length || undefined}
                onMouseEnter={() => setHighlight(matches.length)}
                onClick={() => void createFromQuery()}
                data-testid="place-create"
              >
                <span className={styles.plus}>+</span>
                <span className={styles.optionName}>
                  Create “<strong>{query.trim()}</strong>”
                </span>
              </button>
            )}

            {matches.length === 0 && !canCreate && (
              <p className={styles.empty}>No places yet — type a name to add one.</p>
            )}
          </div>

          <button
            type="button"
            className={styles.locate}
            onClick={useCurrentPosition}
            disabled={locating}
            data-testid="place-use-current"
          >
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <circle cx="7" cy="7" r="2.4" fill="currentColor" />
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 0v2M7 12v2M0 7h2M12 7h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {locating ? 'Finding you…' : query.trim() ? `Save “${query.trim()}” where I am` : 'Use where I am'}
          </button>
        </div>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 12 14" width="11" height="12" className={styles.pin} aria-hidden="true">
      <path
        d="M6 13S1.5 8.5 1.5 5.5a4.5 4.5 0 019 0C10.5 8.5 6 13 6 13z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="6" cy="5.4" r="1.6" fill="currentColor" />
    </svg>
  );
}
