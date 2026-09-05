import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { fromIso, today } from '@tasktracker/shared';
import { buildSegments, clusterPoints, fitRange, levelForRange, panRange, rangeFor, scaleFor, ticksFor, zoomRange, ZOOM_LEVELS, } from './geometry.js';
import { STATUS_LABEL } from '../../components/StatusChip.js';
import styles from './Timeline.module.css';
const NAME_WIDTH = 210;
const AXIS_HEIGHT = 34;
// Enough room for the last axis label, which is drawn to the right of its tick
// and would otherwise be cut off at the canvas edge.
const PADDING_RIGHT = 64;
export function Timeline({ data, groupByPage, onSelectTask, onRangeChange, range }) {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(900);
    const [rowHeight, setRowHeight] = useState(40);
    const [pointRadius, setPointRadius] = useState(5);
    const [lineWeight, setLineWeight] = useState(2.5);
    const [hover, setHover] = useState(null);
    const [collapsed, setCollapsed] = useState(new Set());
    const todayDate = today();
    const level = levelForRange(range);
    /* Geometry comes from the active theme, so switching theme reflows the chart
       without touching this code (DD-8). */
    useEffect(() => {
        const read = () => {
            const style = getComputedStyle(document.documentElement);
            const px = (name, fallback) => {
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
        if (!element)
            return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry)
                setWidth(entry.contentRect.width);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    /** Every task's drawn extent, for framing the view. */
    const spans = useMemo(() => data.tasks.map((task) => {
        const segments = buildSegments(task, todayDate);
        return {
            from: segments[0]?.from ?? task.created_on,
            to: segments[segments.length - 1]?.to ?? todayDate,
        };
    }), [data.tasks, todayDate]);
    const plotWidth = Math.max(240, width - NAME_WIDTH - PADDING_RIGHT);
    const x = useMemo(() => scaleFor(range, plotWidth), [range, plotWidth]);
    const ticks = useMemo(() => ticksFor(range, level), [range, level]);
    /** Rows, grouped by page when asked. Collapsed groups render one summary row. */
    const rows = useMemo(() => {
        const pageById = new Map(data.pages.map((p) => [p.id, p]));
        if (!groupByPage) {
            return data.tasks.map((task) => ({ kind: 'task', task, page: pageById.get(task.page_id) }));
        }
        const out = [];
        for (const page of data.pages) {
            const pageTasks = data.tasks.filter((t) => t.page_id === page.id);
            if (pageTasks.length === 0)
                continue;
            out.push({
                kind: 'group',
                pageId: page.id,
                name: page.name,
                colour: page.colour,
                count: pageTasks.length,
            });
            if (!collapsed.has(page.id)) {
                for (const task of pageTasks)
                    out.push({ kind: 'task', task, page });
            }
        }
        return out;
    }, [data, groupByPage, collapsed]);
    const height = AXIS_HEIGHT + rows.length * rowHeight + 16;
    /* ------------------------------------------------------- interaction --- */
    const setLevel = useCallback((next) => {
        onRangeChange(zoomRange(range, next, todayDate));
    }, [range, todayDate, onRangeChange]);
    const pan = useCallback((days) => onRangeChange(panRange(range, days)), [range, onRangeChange]);
    useEffect(() => {
        const onKey = (event) => {
            const target = event.target;
            if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName))
                return;
            if (event.key === 'ArrowLeft')
                pan(-Math.round(daysIn(range) / 8));
            else if (event.key === 'ArrowRight')
                pan(Math.round(daysIn(range) / 8));
            else if (event.key === 't' || event.key === 'T')
                onRangeChange(rangeFor(level, todayDate));
            else if (event.key === '+' || event.key === '=') {
                const i = ZOOM_LEVELS.indexOf(level);
                if (i > 0)
                    setLevel(ZOOM_LEVELS[i - 1]);
            }
            else if (event.key === '-' || event.key === '_') {
                const i = ZOOM_LEVELS.indexOf(level);
                if (i < ZOOM_LEVELS.length - 1)
                    setLevel(ZOOM_LEVELS[i + 1]);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [level, range, pan, setLevel, onRangeChange, todayDate]);
    const dragState = useRef(null);
    const onPointerDown = (event) => {
        if (event.button !== 0)
            return;
        dragState.current = { startX: event.clientX, startRange: range };
        event.target.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
        const state = dragState.current;
        if (!state)
            return;
        const dx = event.clientX - state.startX;
        const daysPerPixel = daysIn(state.startRange) / plotWidth;
        onRangeChange(panRange(state.startRange, -Math.round(dx * daysPerPixel)));
    };
    const endDrag = () => {
        dragState.current = null;
    };
    const todayX = x(todayDate);
    return (_jsxs("div", { className: styles.root, children: [_jsxs("div", { className: styles.controls, children: [_jsx("div", { className: styles.zoomGroup, role: "group", "aria-label": "Zoom level", children: ZOOM_LEVELS.map((option) => (_jsx("button", { type: "button", className: styles.zoomButton, "data-active": option === level || undefined, onClick: () => setLevel(option), "data-testid": `zoom-${option}`, children: option[0].toUpperCase() + option.slice(1) }, option))) }), _jsxs("div", { className: styles.rightControls, children: [_jsx("button", { type: "button", className: styles.todayButton, onClick: () => onRangeChange(fitRange(spans, todayDate)), "data-testid": "timeline-fit", title: "Frame everything", children: "Fit" }), _jsx("button", { type: "button", className: styles.todayButton, onClick: () => onRangeChange(rangeFor(level, todayDate)), "data-testid": "timeline-today", children: "Today" })] })] }), _jsxs("div", { className: styles.canvas, ref: containerRef, children: [data.tasks.length === 0 ? (_jsx("p", { className: styles.empty, children: "No tasks in this period." })) : (_jsxs("svg", { width: width, height: height, className: styles.svg, onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, "data-testid": "timeline-svg", role: "img", "aria-label": `Timeline of ${data.tasks.length} tasks from ${range.from} to ${range.to}`, children: [_jsx("defs", { children: _jsx("clipPath", { id: "plot-clip", children: _jsx("rect", { x: NAME_WIDTH, y: 0, width: plotWidth + PADDING_RIGHT, height: height }) }) }), _jsx("g", { className: styles.axis, clipPath: "url(#plot-clip)", children: ticks.map((tick) => {
                                    const tx = NAME_WIDTH + x(tick.date);
                                    return (_jsxs("g", { children: [_jsx("line", { x1: tx, y1: AXIS_HEIGHT, x2: tx, y2: height, className: tick.major ? styles.gridMajor : styles.grid }), _jsx("text", { x: tx + 4, y: 20, className: tick.major ? styles.tickMajor : styles.tick, children: tick.label })] }, tick.date));
                                }) }), todayX >= 0 && todayX <= plotWidth && (_jsx("g", { clipPath: "url(#plot-clip)", children: _jsx("line", { x1: NAME_WIDTH + todayX, y1: AXIS_HEIGHT - 6, x2: NAME_WIDTH + todayX, y2: height, className: styles.todayLine, "data-testid": "today-marker" }) })), rows.map((row, index) => {
                                const y = AXIS_HEIGHT + index * rowHeight + rowHeight / 2;
                                if (row.kind === 'group') {
                                    const isCollapsed = collapsed.has(row.pageId);
                                    return (_jsxs("g", { className: styles.groupRow, children: [_jsx("rect", { x: 0, y: y - rowHeight / 2, width: width, height: rowHeight, className: styles.groupBand }), _jsxs("g", { role: "button", tabIndex: 0, className: styles.groupToggle, onClick: () => setCollapsed((current) => {
                                                    const next = new Set(current);
                                                    if (next.has(row.pageId))
                                                        next.delete(row.pageId);
                                                    else
                                                        next.add(row.pageId);
                                                    return next;
                                                }), onKeyDown: (event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        setCollapsed((current) => {
                                                            const next = new Set(current);
                                                            if (next.has(row.pageId))
                                                                next.delete(row.pageId);
                                                            else
                                                                next.add(row.pageId);
                                                            return next;
                                                        });
                                                    }
                                                }, "aria-expanded": !isCollapsed, "data-testid": `timeline-group-${row.name}`, children: [_jsx("path", { d: isCollapsed ? 'M6 -3.5l4 3.5-4 3.5z' : 'M5 -2l3.5 4 3.5-4z', transform: `translate(4 ${y})`, className: styles.chevron }), _jsx("circle", { cx: 22, cy: y, r: 4, fill: row.colour }), _jsx("text", { x: 34, y: y + 4, className: styles.groupName, children: row.name }), _jsx("text", { x: NAME_WIDTH - 10, y: y + 4, textAnchor: "end", className: styles.groupCount, children: row.count })] })] }, `group-${row.pageId}`));
                                }
                                const { task } = row;
                                const segments = buildSegments(task, todayDate);
                                const points = clusterPoints(task.updates.map((update) => ({ x: x(update.occurred_on), item: update })), pointRadius * 2.2);
                                // The cap sits at the end of the drawn line, which is the last
                                // segment's end — not necessarily completed_on, since an update
                                // may extend a task's span past it.
                                const lastSegment = segments[segments.length - 1];
                                const lineEndDate = lastSegment ? lastSegment.to : (task.completed_on ?? todayDate);
                                const lineEnd = x(lineEndDate);
                                const isDone = task.status === 'done';
                                return (_jsxs("g", { className: styles.taskRow, children: [_jsx("rect", { x: 0, y: y - rowHeight / 2, width: width, height: rowHeight, className: styles.rowHit }), _jsx("rect", { x: 0, y: y - rowHeight / 2, width: NAME_WIDTH, height: rowHeight, className: styles.nameBand }), _jsx("text", { x: groupByPage ? 20 : 8, y: y + 4, className: styles.taskName, onClick: () => onSelectTask(task.id), role: "button", tabIndex: 0, onKeyDown: (event) => {
                                                if (event.key === 'Enter')
                                                    onSelectTask(task.id);
                                            }, "data-testid": `timeline-task-${task.title}`, children: truncate(task.title, groupByPage ? 26 : 28) }), _jsxs("g", { clipPath: "url(#plot-clip)", children: [segments.map((segment, i) => (_jsx("line", { x1: NAME_WIDTH + x(segment.from), y1: y, x2: NAME_WIDTH + x(segment.to), y2: y, stroke: task.colour, strokeWidth: lineWeight, strokeLinecap: "round", className: styles.segment, "data-status": segment.status, "data-testid": `segment-${task.title}-${segment.status}` }, i))), isDone ? (_jsx("path", { d: diamond(NAME_WIDTH + lineEnd, y, pointRadius + 1.5), fill: task.colour, className: styles.capDone, "data-testid": `cap-done-${task.title}` })) : (_jsx("path", { d: arrow(NAME_WIDTH + lineEnd, y, pointRadius + 1), fill: task.colour, className: styles.capOpen, "data-testid": `cap-open-${task.title}` })), points.map((cluster, i) => (_jsxs("g", { children: [_jsx("circle", { cx: NAME_WIDTH + cluster.x, cy: y, r: pointRadius, fill: task.colour, className: styles.point, tabIndex: 0, role: "button", "aria-label": `${cluster.items.length} update${cluster.items.length === 1 ? '' : 's'} on ${cluster.items[0].occurred_on}: ${cluster.items[0].body}`, "data-testid": `point-${task.title}`, onMouseEnter: (event) => setHover({
                                                                x: NAME_WIDTH + cluster.x,
                                                                y: y - pointRadius - 6,
                                                                title: task.title,
                                                                entries: cluster.items,
                                                            }), onMouseLeave: () => setHover(null), onFocus: () => setHover({
                                                                x: NAME_WIDTH + cluster.x,
                                                                y: y - pointRadius - 6,
                                                                title: task.title,
                                                                entries: cluster.items,
                                                            }), onBlur: () => setHover(null), onClick: (event) => {
                                                                event.stopPropagation();
                                                                onSelectTask(task.id);
                                                            } }), cluster.items.length > 1 && (_jsx("text", { x: NAME_WIDTH + cluster.x, y: y + 3, className: styles.clusterCount, children: cluster.items.length }))] }, i)))] })] }, task.id));
                            })] })), hover && (_jsxs("div", { className: styles.card, style: { left: hover.x, top: hover.y }, "data-testid": "timeline-hover-card", children: [_jsx("div", { className: styles.cardTitle, children: hover.title }), hover.entries.map((entry) => (_jsxs("div", { className: styles.cardEntry, children: [_jsx("span", { className: styles.cardDate, children: formatShort(entry.occurred_on) }), _jsx("span", { children: entry.body })] }, entry.occurred_on + entry.body)))] }))] }), _jsx("div", { className: styles.legend, children: ['in_progress', 'blocked', 'todo', 'done'].map((status) => (_jsxs("span", { className: styles.legendItem, children: [_jsx("svg", { width: "22", height: "8", "aria-hidden": "true", children: _jsx("line", { x1: "1", y1: "4", x2: "21", y2: "4", className: styles.segment, "data-status": status, stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round" }) }), STATUS_LABEL[status]] }, status))) })] }));
}
/* ---------------------------------------------------------- internals --- */
function daysIn(range) {
    return Math.max(1, Math.round((fromIso(range.to).getTime() - fromIso(range.from).getTime()) / 86_400_000));
}
function diamond(cx, cy, r) {
    return `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`;
}
function arrow(x, y, r) {
    return `M${x - r} ${y - r}L${x + r} ${y}L${x - r} ${y + r}Z`;
}
function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
function formatShort(date) {
    const d = fromIso(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
//# sourceMappingURL=Timeline.js.map