import { describe, expect, it } from 'vitest';
import {
  buildSegments,
  fitRange,
  clusterPoints,
  levelForRange,
  panRange,
  rangeFor,
  scaleFor,
  ticksFor,
  zoomRange,
  ZOOM_SPAN,
} from './geometry.js';

describe('scaleFor', () => {
  const range = { from: '2026-08-01', to: '2026-08-31' };

  it('maps the range start to 0 and the end to the plot width', () => {
    const x = scaleFor(range, 300);
    expect(x('2026-08-01')).toBe(0);
    expect(x('2026-08-31')).toBe(300);
  });

  it('is linear in between', () => {
    const x = scaleFor(range, 300);
    expect(x('2026-08-16')).toBeCloseTo(150, 5);
  });

  it('extends beyond the range for clipped values', () => {
    const x = scaleFor(range, 300);
    expect(x('2026-07-31')).toBeLessThan(0);
    expect(x('2026-09-01')).toBeGreaterThan(300);
  });
});

describe('rangeFor and zoom', () => {
  it('produces a range of the level width, weighted towards the past', () => {
    const range = rangeFor('week', '2026-09-04');
    expect(range.from < '2026-09-04').toBe(true);
    expect(range.to > '2026-09-04').toBe(true);
    // More history than future — most of what you want to see has happened.
    const before = new Date(range.to).getTime() - new Date('2026-09-04').getTime();
    const after = new Date('2026-09-04').getTime() - new Date(range.from).getTime();
    expect(after).toBeGreaterThan(before);
  });

  it('keeps the anchor date at the same fraction when zooming', () => {
    const range = { from: '2026-08-01', to: '2026-08-31' };
    const anchor = '2026-08-16'; // the middle
    const zoomed = zoomRange(range, 'month', anchor);
    const span = ZOOM_SPAN.month;
    const fromAnchor =
      (new Date(anchor).getTime() - new Date(zoomed.from).getTime()) / 86_400_000;
    expect(fromAnchor / span).toBeCloseTo(0.5, 1);
  });

  it('pans without changing width', () => {
    const range = { from: '2026-08-01', to: '2026-08-31' };
    const panned = panRange(range, 10);
    expect(panned.from).toBe('2026-08-11');
    expect(panned.to).toBe('2026-09-10');
  });

  it('recognises which level a range corresponds to', () => {
    expect(levelForRange(rangeFor('day', '2026-09-04'))).toBe('day');
    expect(levelForRange(rangeFor('week', '2026-09-04'))).toBe('week');
    expect(levelForRange(rangeFor('month', '2026-09-04'))).toBe('month');
    expect(levelForRange(rangeFor('quarter', '2026-09-04'))).toBe('quarter');
  });
});

describe('fitRange', () => {
  const TODAY = '2026-09-04';

  it('falls back to a default window with no data', () => {
    const range = fitRange([], TODAY);
    expect(range.from < TODAY).toBe(true);
    expect(range.to > TODAY).toBe(true);
  });

  it('frames the data with padding on both sides', () => {
    const range = fitRange([{ from: '2026-08-01', to: '2026-08-31' }], TODAY);
    expect(range.from < '2026-08-01').toBe(true);
    expect(range.to > TODAY).toBe(true);
  });

  it('always keeps today in frame', () => {
    // Everything finished months ago; today must still be visible, since it is
    // the reference the whole chart is read against.
    const range = fitRange([{ from: '2026-01-01', to: '2026-02-01' }], TODAY);
    expect(range.from <= '2026-01-01').toBe(true);
    expect(range.to >= TODAY).toBe(true);
  });

  it('widens a very narrow span to a readable minimum', () => {
    const range = fitRange([{ from: TODAY, to: TODAY }], TODAY, 21);
    const days =
      (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(21);
  });

  it('spans the union of several tasks', () => {
    const range = fitRange(
      [
        { from: '2026-07-01', to: '2026-07-20' },
        { from: '2026-08-15', to: '2026-09-01' },
      ],
      TODAY,
    );
    expect(range.from < '2026-07-01').toBe(true);
    expect(range.to > TODAY).toBe(true);
  });
});

describe('ticksFor', () => {
  it('produces daily ticks at day level, inside the range', () => {
    const range = { from: '2026-09-01', to: '2026-09-08' };
    const ticks = ticksFor(range, 'day');
    expect(ticks).toHaveLength(8);
    expect(ticks.every((t) => t.date >= range.from && t.date <= range.to)).toBe(true);
  });

  it('produces weekly ticks on Mondays', () => {
    const ticks = ticksFor({ from: '2026-08-01', to: '2026-09-30' }, 'week');
    expect(ticks.length).toBeGreaterThan(4);
    for (const tick of ticks) {
      expect(new Date(`${tick.date}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it('produces monthly ticks on the first of the month', () => {
    const ticks = ticksFor({ from: '2026-01-15', to: '2026-12-31' }, 'month');
    expect(ticks.every((t) => t.date.endsWith('-01'))).toBe(true);
    expect(ticks.length).toBeGreaterThanOrEqual(11);
  });

  it('marks January as major and labels it with the year', () => {
    const ticks = ticksFor({ from: '2025-11-01', to: '2026-06-01' }, 'month');
    const january = ticks.find((t) => t.date === '2026-01-01');
    expect(january?.major).toBe(true);
    expect(january?.label).toBe('2026');
  });

  it('produces quarterly ticks on quarter boundaries', () => {
    const ticks = ticksFor({ from: '2025-01-01', to: '2026-12-31' }, 'quarter');
    for (const tick of ticks) {
      const month = new Date(`${tick.date}T00:00:00Z`).getUTCMonth();
      expect(month % 3).toBe(0);
    }
  });

  it('never returns ticks outside the range', () => {
    const range = { from: '2026-03-15', to: '2026-05-20' };
    for (const level of ['day', 'week', 'month', 'quarter'] as const) {
      for (const tick of ticksFor(range, level)) {
        expect(tick.date >= range.from && tick.date <= range.to).toBe(true);
      }
    }
  });
});

describe('buildSegments', () => {
  const TODAY = '2026-09-04';

  it('gives an open task one segment running to today', () => {
    const segments = buildSegments(
      {
        created_on: '2026-08-12',
        completed_on: null,
        status_events: [{ status: 'todo', occurred_on: '2026-08-12' }],
      },
      TODAY,
    );
    expect(segments).toEqual([{ from: '2026-08-12', to: TODAY, status: 'todo' }]);
  });

  it('terminates a done task at its completion date', () => {
    const segments = buildSegments(
      {
        created_on: '2026-08-12',
        completed_on: '2026-08-20',
        status_events: [
          { status: 'todo', occurred_on: '2026-08-12' },
          { status: 'done', occurred_on: '2026-08-20' },
        ],
      },
      TODAY,
    );
    expect(segments[0]).toEqual({ from: '2026-08-12', to: '2026-08-20', status: 'todo' });
    expect(segments.at(-1)?.to).toBe('2026-08-20');
  });

  it('renders a blocked stretch as its own segment', () => {
    // The behaviour that justifies the whole status-events design: you can see
    // how long the task sat blocked.
    const segments = buildSegments(
      {
        created_on: '2026-08-01',
        completed_on: null,
        status_events: [
          { status: 'todo', occurred_on: '2026-08-01' },
          { status: 'in_progress', occurred_on: '2026-08-05' },
          { status: 'blocked', occurred_on: '2026-08-10' },
          { status: 'in_progress', occurred_on: '2026-08-20' },
        ],
      },
      TODAY,
    );
    expect(segments).toEqual([
      { from: '2026-08-01', to: '2026-08-05', status: 'todo' },
      { from: '2026-08-05', to: '2026-08-10', status: 'in_progress' },
      { from: '2026-08-10', to: '2026-08-20', status: 'blocked' },
      { from: '2026-08-20', to: TODAY, status: 'in_progress' },
    ]);
    const blocked = segments.find((s) => s.status === 'blocked')!;
    expect(blocked.from).toBe('2026-08-10');
    expect(blocked.to).toBe('2026-08-20'); // ten days, visible as a length
  });

  it('collapses events sharing a date, avoiding zero-width segments', () => {
    const segments = buildSegments(
      {
        created_on: '2026-08-01',
        completed_on: null,
        status_events: [
          { status: 'todo', occurred_on: '2026-08-01' },
          { status: 'in_progress', occurred_on: '2026-08-01' },
        ],
      },
      TODAY,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]!.status).toBe('in_progress');
  });

  it('extends the line back when an event predates created_on', () => {
    const segments = buildSegments(
      {
        created_on: '2026-08-10',
        completed_on: null,
        status_events: [{ status: 'in_progress', occurred_on: '2026-08-01' }],
      },
      TODAY,
    );
    expect(segments[0]!.from).toBe('2026-08-01');
  });

  it('falls back to a single todo segment with no events at all', () => {
    const segments = buildSegments(
      { created_on: '2026-08-12', completed_on: null, status_events: [] },
      TODAY,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]!.status).toBe('todo');
  });

  it('handles events arriving out of order', () => {
    const segments = buildSegments(
      {
        created_on: '2026-08-01',
        completed_on: null,
        status_events: [
          { status: 'blocked', occurred_on: '2026-08-10' },
          { status: 'todo', occurred_on: '2026-08-01' },
        ],
      },
      TODAY,
    );
    expect(segments[0]!.status).toBe('todo');
    expect(segments[1]!.status).toBe('blocked');
  });
});

describe('clusterPoints', () => {
  it('keeps well-separated points apart', () => {
    const clusters = clusterPoints(
      [
        { x: 0, item: 'a' },
        { x: 50, item: 'b' },
        { x: 100, item: 'c' },
      ],
      10,
    );
    expect(clusters).toHaveLength(3);
  });

  it('merges points closer than the minimum distance', () => {
    const clusters = clusterPoints(
      [
        { x: 0, item: 'a' },
        { x: 3, item: 'b' },
        { x: 5, item: 'c' },
        { x: 80, item: 'd' },
      ],
      10,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.items).toEqual(['a', 'b', 'c']);
    expect(clusters[1]!.items).toEqual(['d']);
  });

  it('anchors a cluster at its first point', () => {
    const clusters = clusterPoints(
      [
        { x: 10, item: 'a' },
        { x: 12, item: 'b' },
      ],
      10,
    );
    expect(clusters[0]!.x).toBe(10);
  });

  it('handles an empty input', () => {
    expect(clusterPoints([], 10)).toEqual([]);
  });
});
