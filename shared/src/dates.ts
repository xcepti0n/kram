/**
 * Calendar-date helpers. Dates here are `YYYY-MM-DD` strings representing days as
 * the user means them — no time, no timezone (see .docs/tasks/design.md §1.1).
 *
 * Arithmetic goes through UTC deliberately: constructing local Date objects makes
 * `addDays` cross a daylight-saving boundary incorrectly, which would silently
 * shift task dates twice a year.
 */

export type IsoDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

/** Today in the caller's local timezone, as a calendar date. */
export function today(now: Date = new Date()): IsoDate {
  return toIso(
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
  );
}

export function toIso(date: Date): IsoDate {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromIso(value: IsoDate): Date {
  const m = DATE_RE.exec(value);
  if (!m) throw new Error(`not an ISO date: ${value}`);
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const date = fromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function addMonths(value: IsoDate, months: number): IsoDate {
  const date = fromIso(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  // Clamp to the month's length: 31 Jan + 1 month is 28/29 Feb, not 3 March.
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIso(date);
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = fromIso(b).getTime() - fromIso(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function clampDate(value: IsoDate, lo: IsoDate, hi: IsoDate): IsoDate {
  return minDate(maxDate(value, lo), hi);
}

/* ------------------------------------------------------------- parsing --- */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
];

/**
 * Parse typed date input (FR-10.6). Deliberately a small fixed grammar rather
 * than a natural-language library: behaviour stays predictable and offline, and
 * unrecognised input returns null so the caller can keep the previous value
 * instead of silently guessing.
 *
 * Accepts: `today`, `yesterday`, `tomorrow`, `3 Aug`, `Aug 3`, `3 Aug 2025`,
 * `last monday`, `next fri`, `12/8` and `12/8/2025` (day-first), `2025-08-03`,
 * and bare `+3` / `-5` day offsets.
 */
export function parseDateInput(
  input: string,
  reference: IsoDate = today(),
): IsoDate | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (text === '') return null;

  if (isIsoDate(text)) return text;

  if (text === 'today' || text === 'now') return reference;
  if (text === 'yesterday') return addDays(reference, -1);
  if (text === 'tomorrow') return addDays(reference, 1);

  const offset = /^([+-])\s*(\d+)\s*(d|day|days)?$/.exec(text);
  if (offset) {
    const sign = offset[1] === '-' ? -1 : 1;
    return addDays(reference, sign * Number(offset[2]));
  }

  const relativeWeekday = /^(last|next|this) (\w+)$/.exec(text);
  if (relativeWeekday) {
    const index = WEEKDAYS.findIndex((d) => d.startsWith(relativeWeekday[2]!));
    if (index >= 0) {
      const current = fromIso(reference).getUTCDay();
      let delta = index - current;
      const which = relativeWeekday[1];
      if (which === 'last') delta = delta >= 0 ? delta - 7 : delta;
      else if (which === 'next') delta = delta <= 0 ? delta + 7 : delta;
      return addDays(reference, delta);
    }
  }

  const bareWeekday = WEEKDAYS.findIndex((d) => d.startsWith(text) && text.length >= 3);
  if (bareWeekday >= 0) {
    // A bare weekday means the most recent one, since updates are usually
    // recorded after the fact.
    const current = fromIso(reference).getUTCDay();
    const delta = bareWeekday - current;
    return addDays(reference, delta > 0 ? delta - 7 : delta);
  }

  const refYear = fromIso(reference).getUTCFullYear();

  // "3 aug", "3 aug 2025", "3rd august"
  const dayMonth = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.? ?(\d{4})?$/.exec(text);
  if (dayMonth) {
    const month = MONTHS.findIndex((m) => m.startsWith(dayMonth[2]!));
    if (month >= 0) {
      return build(dayMonth[3] ? Number(dayMonth[3]) : refYear, month + 1, Number(dayMonth[1]));
    }
  }

  // "aug 3", "august 3rd 2025"
  const monthDay = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)? ?(\d{4})?$/.exec(text);
  if (monthDay) {
    const month = MONTHS.findIndex((m) => m.startsWith(monthDay[1]!));
    if (month >= 0) {
      return build(monthDay[3] ? Number(monthDay[3]) : refYear, month + 1, Number(monthDay[2]));
    }
  }

  // "12/8", "12/8/2025", "12-8-25" — day first, matching non-US convention.
  const numeric = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(text);
  if (numeric) {
    let year = refYear;
    if (numeric[3]) {
      const raw = Number(numeric[3]);
      year = raw < 100 ? 2000 + raw : raw;
    }
    return build(year, Number(numeric[2]), Number(numeric[1]));
  }

  return null;
}

function build(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isIsoDate(candidate) ? candidate : null;
}

/* ----------------------------------------------------------- formatting --- */

export function formatDate(value: IsoDate, reference: IsoDate = today()): string {
  const delta = daysBetween(reference, value);
  if (delta === 0) return 'Today';
  if (delta === -1) return 'Yesterday';
  if (delta === 1) return 'Tomorrow';

  const date = fromIso(value);
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()]!;
  const shortMonth = month.charAt(0).toUpperCase() + month.slice(1, 3);
  const sameYear = date.getUTCFullYear() === fromIso(reference).getUTCFullYear();
  return sameYear ? `${day} ${shortMonth}` : `${day} ${shortMonth} ${date.getUTCFullYear()}`;
}
