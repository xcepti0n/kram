/**
 * The timeline (FR-5) — the centerpiece.
 *
 * Hand-written SVG rather than a charting library (DD-5): no library renders
 * this natively, and SVG keeps each update point a real DOM node, so hover,
 * focus and tap work without hit-testing a canvas.
 *
 * Geometry comes from theme tokens, so Dense yields a compact chart and Bold a
 * dramatic one from identical code.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fromIso, today, type TimelineResponse, type TaskStatus } from '@tasktracker/shared';
import {
  buildSegments,
  clusterPoints,
  fitRange,
  levelForRange,
  panRange,
  rangeFor,
  scaleFor,
  ticksFor,
  zoomRange,
  ZOOM_LEVELS,
  type DateRange,
  type ZoomLevel,
} from './geometry.js';
import { STATUS_LABEL } from '../../components/StatusChip.js';
import styles from './Timeline.module.css';

// Two rows: the TODAY pill sits above the date labels rather than on top of
// whichever label happens to be nearest.
const AXIS_HEIGHT = 48;
const TICK_LABEL_Y = 34;
const FLAG_Y = 6;
// Enough room for the last axis label, which is drawn to the right of its tick
// and would otherwise be cut off at the canvas edge.
const PADDING_RIGHT = 64;

/**
 * The name column takes a share of the canvas rather than a fixed width: at 210px
 * on a phone it swallowed more than half the screen and left the plot a useless
 * sliver. It can also be collapsed away entirely, which is what makes the chart
 * usable on a narrow screen.
 */
function nameWidthFor(canvasWidth: number, collapsed: boolean): number {
  if (collapsed) return 0;
  return Math.round(Math.min(210, Math.max(96, canvasWidth * 0.32)));
}

interface HoverCard {
  x: number;
  y: number;
  title: string;
  entries: { body: string; occurred_on: string }[];
}

interface Props {
  data: TimelineResponse;
  groupByPage: boolean;
  onSelectTask: (id: string) => void;
  onRangeChange: (range: DateRange) => void;
  range: DateRange;
}

export function Timeline({ data, groupByPage, onSelectTask, onRangeChange, range }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [rowHeight, setRowHeight] = useState(40);
  const [pointRadius, setPointRadius] = useState(5);
  const [lineWeight, setLineWeight] = useState(2.5);
  const [hover, setHover] = useState<HoverCard | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [namesCollapsed, setNamesCollapsed] = useState(false);

  const todayDate = today();
  const level = levelForRange(range);

  /* Geometry comes from the active theme, so switching theme reflows the chart
     without touching this code (DD-8). */
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const px = (name: string, fallback: number) => {
        const raw = style.getPropertyValue(name).trim();
        const parsed = Number.parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
      };
      setRowHeight(px('--timeline-row-height', 40));
      setPointRadius(px('--point-radius', 5));
      setLineWeight(px('--line-weight', 2.5));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-density', 'data-mode'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Every task's drawn extent, for framing the view. */
  const spans = useMemo(
    () =>
      data.tasks.map((task) => {
        const segments = buildSegments(task, todayDate);
        return {
          from: segments[0]?.from ?? task.created_on,
          to: segments[segments.length - 1]?.to ?? todayDate,
        };
      }),
    [data.tasks, todayDate],
  );

  const NAME_WIDTH = nameWidthFor(width, namesCollapsed);
  const plotWidth = Math.max(160, width - NAME_WIDTH - PADDING_RIGHT);
  const x = useMemo(() => scaleFor(range, plotWidth), [range, plotWidth]);
  // Ticks thin themselves to the plot width, so labels never collide on a phone.
  const ticks = useMemo(() => ticksFor(range, level, plotWidth), [range, level, plotWidth]);

  /** Rows, grouped by page when asked. Collapsed groups render one summary row. */
  const rows = useMemo(() => {
    const pageById = new Map(data.pages.map((p) => [p.id, p]));
    if (!groupByPage) {
      return data.tasks.map((task) => ({ kind: 'task' as const, task, page: pageById.get(task.page_id) }));
    }

    const out: (
      | { kind: 'group'; pageId: string; name: string; colour: string; count: number }
      | { kind: 'task'; task: (typeof data.tasks)[number]; page?: { colour: string } }
    )[] = [];

    for (const page of data.pages) {
      const pageTasks = data.tasks.filter((t) => t.page_id === page.id);
      if (pageTasks.length === 0) continue;
      out.push({
        kind: 'group',
        pageId: page.id,
        name: page.name,
        colour: page.colour,
        count: pageTasks.length,
      });
      if (!collapsed.has(page.id)) {
        for (const task of pageTasks) out.push({ kind: 'task', task, page });
      }
    }
    return out;
  }, [data, groupByPage, collapsed]);

  const height = AXIS_HEIGHT + rows.length * rowHeight + 16;

  /* ------------------------------------------------------- interaction --- */

  const setLevel = useCallback(
    (next: ZoomLevel) => {
      onRangeChange(zoomRange(range, next, todayDate));
    },
    [range, todayDate, onRangeChange],
  );

  const pan = useCallback(
    (days: number) => onRangeChange(panRange(range, days)),
    [range, onRangeChange],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      if (event.key === 'ArrowLeft') pan(-Math.round(daysIn(range) / 8));
      else if (event.key === 'ArrowRight') pan(Math.round(daysIn(range) / 8));
      else if (event.key === 't' || event.key === 'T') onRangeChange(rangeFor(level, todayDate));
      else if (event.key === '+' || event.key === '=') {
        const i = ZOOM_LEVELS.indexOf(level);
        if (i > 0) setLevel(ZOOM_LEVELS[i - 1]!);
      } else if (event.key === '-' || event.key === '_') {
        const i = ZOOM_LEVELS.indexOf(level);
        if (i < ZOOM_LEVELS.length - 1) setLevel(ZOOM_LEVELS[i + 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [level, range, pan, setLevel, onRangeChange, todayDate]);

  const dragState = useRef<{ startX: number; startRange: DateRange } | null>(null);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragState.current = { startX: event.clientX, startRange: range };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const state = dragState.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const daysPerPixel = daysIn(state.startRange) / plotWidth;
    onRangeChange(panRange(state.startRange, -Math.round(dx * daysPerPixel)));
  };

  const endDrag = () => {
    dragState.current = null;
  };

  const todayX = x(todayDate);

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.zoomGroup} role="group" aria-label="Zoom level">
          {ZOOM_LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              className={styles.zoomButton}
              data-active={option === level || undefined}
              onClick={() => setLevel(option)}
              data-testid={`zoom-${option}`}
            >
              {option[0]!.toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
        <div className={styles.rightControls}>
          <button
            type="button"
            className={styles.todayButton}
            onClick={() => setNamesCollapsed((v) => !v)}
            aria-pressed={namesCollapsed}
            title={namesCollapsed ? 'Show task names' : 'Hide task names for more chart'}
            data-testid="timeline-toggle-names"
          >
            {namesCollapsed ? 'Names' : 'Hide names'}
          </button>
          <button
            type="button"
            className={styles.todayButton}
            onClick={() => onRangeChange(fitRange(spans, todayDate))}
            data-testid="timeline-fit"
            title="Frame everything"
          >
            Fit
          </button>
          <button
            type="button"
            className={styles.todayButton}
            onClick={() => onRangeChange(rangeFor(level, todayDate))}
            data-testid="timeline-today"
          >
            Today
          </button>
        </div>
      </div>

      <div className={styles.canvas} ref={containerRef}>
        {data.tasks.length === 0 ? (
          <p className={styles.empty}>No tasks in this period.</p>
        ) : (
          <svg
            width={width}
            height={height}
            className={styles.svg}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            data-testid="timeline-svg"
            role="img"
            aria-label={`Timeline of ${data.tasks.length} tasks from ${range.from} to ${range.to}`}
          >
            <defs>
              {/* Clip the plot so lines extending past the range are cut at the
                  edge rather than drawn over the name column. */}
              <clipPath id="plot-clip">
                <rect x={NAME_WIDTH} y={0} width={plotWidth + PADDING_RIGHT} height={height} />
              </clipPath>
            </defs>

            {/* Axis */}
            <g className={styles.axis} clipPath="url(#plot-clip)" data-testid="timeline-axis">
              {ticks.map((tick) => {
                const tx = NAME_WIDTH + x(tick.date);
                return (
                  <g key={tick.date}>
                    <line
                      x1={tx}
                      y1={AXIS_HEIGHT}
                      x2={tx}
                      y2={height}
                      className={tick.major ? styles.gridMajor : styles.grid}
                    />
                    <text
                      x={tx + 4}
                      y={TICK_LABEL_Y}
                      className={tick.major ? styles.tickMajor : styles.tick}
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Today marker (FR-5.8) */}
            {todayX >= 0 && todayX <= plotWidth && (
              <g clipPath="url(#plot-clip)">
                <line
                  x1={NAME_WIDTH + todayX}
                  y1={FLAG_Y + 15}
                  x2={NAME_WIDTH + todayX}
                  y2={height}
                  className={styles.todayLine}
                  data-testid="today-marker"
                />
                {/* A labelled pill, so "where is now" is answered without
                    tracing a dashed line up to the axis. */}
                {/* Clamped inside the plot, so the pill stays whole when today
                    sits at either edge of the framed range. */}
                <rect
                  x={Math.min(
                    Math.max(NAME_WIDTH + todayX - 21, NAME_WIDTH + 1),
                    NAME_WIDTH + plotWidth + PADDING_RIGHT - 43,
                  )}
                  y={FLAG_Y}
                  width={42}
                  height={15}
                  rx={7.5}
                  className={styles.todayFlag}
                />
                <text
                  x={Math.min(
                    Math.max(NAME_WIDTH + todayX, NAME_WIDTH + 22),
                    NAME_WIDTH + plotWidth + PADDING_RIGHT - 22,
                  )}
                  y={FLAG_Y + 11}
                  className={styles.todayFlagText}
                >
                  TODAY
                </text>
              </g>
            )}

            {/* Rows */}
            {rows.map((row, index) => {
              const y = AXIS_HEIGHT + index * rowHeight + rowHeight / 2;
              /* Staggered entrance, capped: past ~20 rows the wait would be
                 longer than the information is worth. */
              const rowDelay = { '--row-delay': `${Math.min(index, 20) * 26}ms` } as React.CSSProperties;

              if (row.kind === 'group') {
                const isCollapsed = collapsed.has(row.pageId);
                return (
                  <g key={`group-${row.pageId}`} className={styles.groupRow} style={rowDelay}>
                    <rect
                      x={0}
                      y={y - rowHeight / 2}
                      width={width}
                      height={rowHeight}
                      className={styles.groupBand}
                    />
                    {/* With names hidden the band is the only affordance, so it
                        takes the whole row rather than leaving a stub. */}
                    <g
                      role="button"
                      tabIndex={0}
                      className={styles.groupToggle}
                      onClick={() =>
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(row.pageId)) next.delete(row.pageId);
                          else next.add(row.pageId);
                          return next;
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(row.pageId)) next.delete(row.pageId);
                            else next.add(row.pageId);
                            return next;
                          });
                        }
                      }}
                      aria-expanded={!isCollapsed}
                      data-testid={`timeline-group-${row.name}`}
                    >
                      <path
                        d={isCollapsed ? 'M6 -3.5l4 3.5-4 3.5z' : 'M5 -2l3.5 4 3.5-4z'}
                        transform={`translate(4 ${y})`}
                        className={styles.chevron}
                      />
                      <circle cx={NAME_WIDTH > 0 ? 22 : 14} cy={y} r={4} fill={row.colour} />
                      {NAME_WIDTH > 0 && (
                        <>
                          <text x={34} y={y + 4} className={styles.groupName}>
                            {truncate(row.name, Math.max(4, Math.floor((NAME_WIDTH - 78) / 7.6)))}
                          </text>
                          {/* Right-aligned inside the name column, so it can never
                              collide with a long page name. */}
                          <text
                            x={NAME_WIDTH - 10}
                            y={y + 4}
                            textAnchor="end"
                            className={styles.groupCount}
                          >
                            {row.count}
                          </text>
                        </>
                      )}
                    </g>
                  </g>
                );
              }

              const { task } = row;
              const segments = buildSegments(task, todayDate);

              const points = clusterPoints(
                task.updates.map((update) => ({ x: x(update.occurred_on), item: update })),
                pointRadius * 2.2,
              );

              // The cap sits at the end of the drawn line, which is the last
              // segment's end — not necessarily completed_on, since an update
              // may extend a task's span past it.
              const lastSegment = segments[segments.length - 1];
              const lineEndDate = lastSegment ? lastSegment.to : (task.completed_on ?? todayDate);
              const lineEnd = x(lineEndDate);
              const isDone = task.status === 'done';

              return (
                <g key={task.id} className={styles.taskRow} style={rowDelay}>
                  {/* Zebra striping, so the eye can track one line across a wide
                      chart without losing its row. */}
                  {index % 2 === 1 && (
                    <rect
                      x={0}
                      y={y - rowHeight / 2}
                      width={width}
                      height={rowHeight}
                      className={styles.rowStripe}
                    />
                  )}
                  <rect
                    x={0}
                    y={y - rowHeight / 2}
                    width={width}
                    height={rowHeight}
                    className={styles.rowHit}
                  />

                  {/* Name column, sticky by being drawn over an opaque band */}
                  {NAME_WIDTH > 0 && (
                    <rect
                      x={0}
                      y={y - rowHeight / 2}
                      width={NAME_WIDTH}
                      height={rowHeight}
                      className={styles.nameBand}
                    />
                  )}
                  {NAME_WIDTH > 0 ? (
                    <text
                      x={groupByPage ? 20 : 8}
                      y={y + 4}
                      className={styles.taskName}
                      onClick={() => onSelectTask(task.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') onSelectTask(task.id);
                      }}
                      data-testid={`timeline-task-${task.title}`}
                    >
                      {truncate(
                        task.title,
                        Math.max(6, Math.floor((NAME_WIDTH - (groupByPage ? 26 : 14)) / 7.1)),
                      )}
                    </text>
                  ) : (
                    /* With names hidden the row still needs an identity, and the
                       task's colour is what the line already uses. */
                    <rect
                      x={2}
                      y={y - 5}
                      width={4}
                      height={10}
                      rx={2}
                      fill={task.colour}
                      className={styles.rowSwatch}
                      onClick={() => onSelectTask(task.id)}
                      data-testid={`timeline-task-${task.title}`}
                    />
                  )}

                  <g clipPath="url(#plot-clip)">
                    {/* Status segments (FR-5.3). A blocked stretch is dashed and
                        desaturated, so its length is readable at a glance. */}
                    {segments.map((segment, i) => (
                      <line
                        key={i}
                        x1={NAME_WIDTH + x(segment.from)}
                        y1={y}
                        x2={NAME_WIDTH + x(segment.to)}
                        y2={y}
                        stroke={task.colour}
                        strokeWidth={lineWeight}
                        strokeLinecap="round"
                        className={styles.segment}
                        data-status={segment.status}
                        data-testid={`segment-${task.title}-${segment.status}`}
                      />
                    ))}

                    {/* Cap: an arrow means still going, a diamond means done. */}
                    {isDone ? (
                      <path
                        d={diamond(NAME_WIDTH + lineEnd, y, pointRadius + 1.5)}
                        fill={task.colour}
                        className={styles.capDone}
                        data-testid={`cap-done-${task.title}`}
                      />
                    ) : (
                      <path
                        d={arrow(NAME_WIDTH + lineEnd, y, pointRadius + 1)}
                        fill={task.colour}
                        className={styles.capOpen}
                        data-testid={`cap-open-${task.title}`}
                      />
                    )}

                    {/* Update points (FR-5.4). Each is focusable, so the hover
                        card is reachable by keyboard as well as pointer. */}
                    {points.map((cluster, i) => (
                      <g key={i} className={styles.pointIn}>
                        <circle
                          cx={NAME_WIDTH + cluster.x}
                          cy={y}
                          r={pointRadius}
                          fill={task.colour}
                          className={styles.point}
                          tabIndex={0}
                          role="button"
                          aria-label={`${cluster.items.length} update${
                            cluster.items.length === 1 ? '' : 's'
                          } on ${cluster.items[0]!.occurred_on}: ${cluster.items[0]!.body}`}
                          data-testid={`point-${task.title}`}
                          onMouseEnter={(event) =>
                            setHover({
                              x: NAME_WIDTH + cluster.x,
                              y: y - pointRadius - 6,
                              title: task.title,
                              entries: cluster.items,
                            })
                          }
                          onMouseLeave={() => setHover(null)}
                          onFocus={() =>
                            setHover({
                              x: NAME_WIDTH + cluster.x,
                              y: y - pointRadius - 6,
                              title: task.title,
                              entries: cluster.items,
                            })
                          }
                          onBlur={() => setHover(null)}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectTask(task.id);
                          }}
                        />
                        {cluster.items.length > 1 && (
                          <text
                            x={NAME_WIDTH + cluster.x}
                            y={y + 3}
                            className={styles.clusterCount}
                          >
                            {cluster.items.length}
                          </text>
                        )}
                      </g>
                    ))}
                  </g>
                </g>
              );
            })}
          </svg>
        )}

        {hover && (
          <div
            className={styles.card}
            style={{ left: hover.x, top: hover.y }}
            data-testid="timeline-hover-card"
          >
            <div className={styles.cardTitle}>{hover.title}</div>
            {hover.entries.map((entry) => (
              <div key={entry.occurred_on + entry.body} className={styles.cardEntry}>
                <span className={styles.cardDate}>{formatShort(entry.occurred_on)}</span>
                <span>{entry.body}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.legend}>
        {(['in_progress', 'blocked', 'todo', 'done'] as TaskStatus[]).map((status) => (
          <span key={status} className={styles.legendItem}>
            <svg width="22" height="8" aria-hidden="true">
              <line
                x1="1"
                y1="4"
                x2="21"
                y2="4"
                className={styles.segment}
                data-status={status}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            {STATUS_LABEL[status]}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- internals --- */

function daysIn(range: DateRange): number {
  return Math.max(
    1,
    Math.round((fromIso(range.to).getTime() - fromIso(range.from).getTime()) / 86_400_000),
  );
}

function diamond(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`;
}

function arrow(x: number, y: number, r: number): string {
  return `M${x - r} ${y - r}L${x + r} ${y}L${x - r} ${y + r}Z`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatShort(date: string): string {
  const d = fromIso(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
