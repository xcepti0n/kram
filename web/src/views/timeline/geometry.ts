/**
 * Timeline geometry — pure functions, unit-tested without a browser.
 *
 * The scale maps a date to a pixel offset. Zoom changes the *range*, never the
 * transform, so geometry stays exact at every level and text never scales
 * (see .docs/timeline/design.md §2).
 */
import {
  addDays,
  addMonths,
  daysBetween,
  fromIso,
  toIso,
  type TaskStatus,
} from '@tasktracker/shared';

export const ZOOM_LEVELS = ['day', 'week', 'month', 'quarter'] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

/** Days visible at each level — the range width, from which the scale follows. */
export const ZOOM_SPAN: Record<ZoomLevel, number> = {
  day: 16,
  week: 91,
  month: 366,
  quarter: 1096,
};

export interface DateRange {
  from: string;
  to: string;
}

/** Pixels per day for a range across a given plot width. */
export function scaleFor(range: DateRange, plotWidth: number): (date: string) => number {
  const span = Math.max(1, daysBetween(range.from, range.to));
  const perDay = plotWidth / span;
  return (date: string) => daysBetween(range.from, date) * perDay;
}

export function rangeFor(level: ZoomLevel, anchor: string): DateRange {
  const span = ZOOM_SPAN[level];
  // Bias the window towards the past: most of what you want to see has already
  // happened, and a little future room shows what is planned.
  const back = Math.round(span * 0.8);
  return { from: addDays(anchor, -back), to: addDays(anchor, span - back) };
}

/**
 * A range that frames the data, with a little breathing room.
 *
 * Opening on a fixed window means a tracker whose work spans six weeks renders
 * into a tenth of the canvas — technically correct and practically useless. The
 * default view should show what there is to see.
 */
export function fitRange(
  spans: readonly { from: string; to: string }[],
  todayDate: string,
  minimumDays = 21,
): DateRange {
  if (spans.length === 0) return rangeFor('week', todayDate);

  let earliest = spans[0]!.from;
  let latest = spans[0]!.to;
  for (const span of spans) {
    if (span.from < earliest) earliest = span.from;
    if (span.to > latest) latest = span.to;
  }
  // Always keep today in frame: it is the reference the whole view is read against.
  if (todayDate < earliest) earliest = todayDate;
  if (todayDate > latest) latest = todayDate;

  const span = Math.max(1, daysBetween(earliest, latest));
  const padding = Math.max(2, Math.round(span * 0.06));
  let from = addDays(earliest, -padding);
  let to = addDays(latest, padding);

  // Widen a very short span so a single new task does not fill the screen.
  const width = daysBetween(from, to);
  if (width < minimumDays) {
    const extra = Math.ceil((minimumDays - width) / 2);
    from = addDays(from, -extra);
    to = addDays(to, extra);
  }
  return { from, to };
}

/** Shift a range by a number of days, keeping its width. */
export function panRange(range: DateRange, days: number): DateRange {
  return { from: addDays(range.from, days), to: addDays(range.to, days) };
}

/**
 * Zoom around a fixed date, so the day under the cursor stays put — what makes
 * zooming feel physical rather than a jump.
 */
export function zoomRange(range: DateRange, level: ZoomLevel, anchorDate: string): DateRange {
  const span = daysBetween(range.from, range.to);
  const anchorFraction = span > 0 ? daysBetween(range.from, anchorDate) / span : 0.5;
  const nextSpan = ZOOM_SPAN[level];
  const from = addDays(anchorDate, -Math.round(nextSpan * anchorFraction));
  return { from, to: addDays(from, nextSpan) };
}

/** The zoom level whose span is closest to a range's width. */
export function levelForRange(range: DateRange): ZoomLevel {
  const span = daysBetween(range.from, range.to);
  let best: ZoomLevel = 'day';
  let bestDelta = Infinity;
  for (const level of ZOOM_LEVELS) {
    const delta = Math.abs(ZOOM_SPAN[level] - span);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = level;
    }
  }
  return best;
}

export interface Tick {
  date: string;
  label: string;
  major: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Axis ticks for a range, thinned to the available width.
 *
 * Density is chosen per level — daily at day level, weekly at week, and so on —
 * but on a narrow screen even weekly labels collide into mush. `plotWidth` sets
 * how many labels can actually fit; the rest keep their gridline and drop their
 * text, so the axis stays readable at any size.
 */
export function ticksFor(range: DateRange, level: ZoomLevel, plotWidth?: number): Tick[] {
  const ticks = allTicks(range, level);
  if (plotWidth === undefined || ticks.length === 0) return ticks;

  // Roughly the width of a label plus breathing room.
  const MIN_LABEL_SPACING = 54;

  // Thin by *position*, not by index. An earlier version kept every major tick
  // unconditionally and strided the rest, which let a month boundary land a few
  // pixels from an already-kept label — "31 Aug" and "7 Sep" overlapped on a
  // phone. Walking left to right and keeping a label only when it clears the
  // last one makes collisions impossible at any width, since the rule is stated
  // in the units the collision actually happens in.
  const span = Math.max(1, daysBetween(range.from, range.to));
  const xOf = (date: string) => (daysBetween(range.from, date) / span) * plotWidth;

  // Major ticks (month and year boundaries) are placed first so they survive
  // thinning, then the minor ones fill whatever gaps are left. Both passes obey
  // the same spacing rule, so priority never buys a collision.
  const keep = new Set<number>();
  const kept: number[] = [];
  const clears = (x: number) => kept.every((k) => Math.abs(x - k) >= MIN_LABEL_SPACING);

  ticks.forEach((tick, index) => {
    if (!tick.major) return;
    const x = xOf(tick.date);
    if (clears(x)) {
      keep.add(index);
      kept.push(x);
    }
  });

  ticks.forEach((tick, index) => {
    if (tick.major) return;
    const x = xOf(tick.date);
    if (clears(x)) {
      keep.add(index);
      kept.push(x);
    }
  });

  return ticks.map((tick, index) => (keep.has(index) ? tick : { ...tick, label: '' }));
}

function allTicks(range: DateRange, level: ZoomLevel): Tick[] {
  const ticks: Tick[] = [];
  const end = range.to;

  if (level === 'day') {
    let cursor = range.from;
    while (cursor <= end) {
      const date = fromIso(cursor);
      const isMonday = date.getUTCDay() === 1;
      ticks.push({
        date: cursor,
        label: `${DAY_SHORT[date.getUTCDay()]} ${date.getUTCDate()}`,
        major: isMonday || date.getUTCDate() === 1,
      });
      cursor = addDays(cursor, 1);
    }
    return ticks;
  }

  if (level === 'week') {
    // Start on the first Monday at or after the range start.
    let cursor = range.from;
    while (fromIso(cursor).getUTCDay() !== 1) cursor = addDays(cursor, 1);
    while (cursor <= end) {
      const date = fromIso(cursor);
      ticks.push({
        date: cursor,
        label: `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]}`,
        major: date.getUTCDate() <= 7, // first Monday of a month
      });
      cursor = addDays(cursor, 7);
    }
    return ticks;
  }

  if (level === 'month') {
    let cursor = firstOfMonth(range.from);
    if (cursor < range.from) cursor = addMonths(cursor, 1);
    while (cursor <= end) {
      const date = fromIso(cursor);
      ticks.push({
        date: cursor,
        label:
          date.getUTCMonth() === 0
            ? String(date.getUTCFullYear())
            : MONTH_SHORT[date.getUTCMonth()]!,
        major: date.getUTCMonth() === 0,
      });
      cursor = addMonths(cursor, 1);
    }
    return ticks;
  }

  // quarter
  let cursor = firstOfMonth(range.from);
  while (fromIso(cursor).getUTCMonth() % 3 !== 0) cursor = addMonths(cursor, 1);
  while (cursor <= end) {
    const date = fromIso(cursor);
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    ticks.push({
      date: cursor,
      label: quarter === 1 ? String(date.getUTCFullYear()) : `Q${quarter}`,
      major: quarter === 1,
    });
    cursor = addMonths(cursor, 3);
  }
  return ticks;
}

function firstOfMonth(date: string): string {
  const d = fromIso(date);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

/* ------------------------------------------------------------ segments --- */

export interface StatusSegment {
  from: string;
  to: string;
  status: TaskStatus;
}

export interface SegmentInput {
  created_on: string;
  completed_on: string | null;
  status_events: { status: TaskStatus; occurred_on: string }[];
}

/**
 * Split a task's life into segments, one per interval between consecutive status
 * events, each carrying the status in force during it.
 *
 * This is what separates the view from a row of dots: a task that ran, stalled
 * for ten days, then finished reads as solid → dashed → solid, and the length of
 * the dashed stretch answers "how long was that blocked?".
 */
export function buildSegments(task: SegmentInput, todayDate: string): StatusSegment[] {
  const events = [...task.status_events].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  if (events.length === 0) {
    return [
      {
        from: task.created_on,
        to: task.completed_on ?? maxOf(todayDate, task.created_on),
        status: 'todo',
      },
    ];
  }

  // Events on the same day collapse to the last one, so a task that went
  // todo → in_progress in one sitting has no zero-width segment.
  const collapsed: typeof events = [];
  for (const event of events) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && previous.occurred_on === event.occurred_on) collapsed[collapsed.length - 1] = event;
    else collapsed.push(event);
  }

  const end = task.completed_on ?? maxOf(todayDate, collapsed[collapsed.length - 1]!.occurred_on);
  const segments: StatusSegment[] = [];

  // A line starts at the earliest thing known about the task: an update or a
  // backdated event may precede created_on, and recording reality beats
  // enforcing a rule the user did not ask for.
  const start = minOf(task.created_on, collapsed[0]!.occurred_on);
  if (start < collapsed[0]!.occurred_on) {
    segments.push({ from: start, to: collapsed[0]!.occurred_on, status: 'todo' });
  }

  for (let i = 0; i < collapsed.length; i += 1) {
    const event = collapsed[i]!;
    const next = collapsed[i + 1];
    const to = next ? next.occurred_on : end;
    if (to < event.occurred_on) continue; // a done date before its event; skip
    segments.push({ from: event.occurred_on, to, status: event.status });
  }

  return segments.filter((s) => s.status !== 'done' || s.from !== s.to);
}

function minOf(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxOf(a: string, b: string): string {
  return a >= b ? a : b;
}

/* -------------------------------------------------------------- points --- */

export interface PointCluster<T> {
  x: number;
  items: T[];
}

/**
 * Group points that would overlap into one marker. Without this a busy week
 * becomes an unreadable smear.
 */
export function clusterPoints<T>(
  points: { x: number; item: T }[],
  minDistance: number,
): PointCluster<T>[] {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const clusters: PointCluster<T>[] = [];

  for (const point of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && point.x - last.x < minDistance) {
      last.items.push(point.item);
      // Keep the marker on the first point so it stays anchored to the earliest
      // event in the cluster rather than drifting as items are added.
    } else {
      clusters.push({ x: point.x, items: [point.item] });
    }
  }

  return clusters;
}

/** Clamp a value to a range, used to keep clipped lines inside the plot. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}
