/**
 * Timeline geometry — pure functions, unit-tested without a browser.
 *
 * The scale maps a date to a pixel offset. Zoom changes the *range*, never the
 * transform, so geometry stays exact at every level and text never scales
 * (see .docs/timeline/design.md §2).
 */
import { type TaskStatus } from '@tasktracker/shared';
export declare const ZOOM_LEVELS: readonly ["day", "week", "month", "quarter"];
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
/** Days visible at each level — the range width, from which the scale follows. */
export declare const ZOOM_SPAN: Record<ZoomLevel, number>;
export interface DateRange {
    from: string;
    to: string;
}
/** Pixels per day for a range across a given plot width. */
export declare function scaleFor(range: DateRange, plotWidth: number): (date: string) => number;
export declare function rangeFor(level: ZoomLevel, anchor: string): DateRange;
/**
 * A range that frames the data, with a little breathing room.
 *
 * Opening on a fixed window means a tracker whose work spans six weeks renders
 * into a tenth of the canvas — technically correct and practically useless. The
 * default view should show what there is to see.
 */
export declare function fitRange(spans: readonly {
    from: string;
    to: string;
}[], todayDate: string, minimumDays?: number): DateRange;
/** Shift a range by a number of days, keeping its width. */
export declare function panRange(range: DateRange, days: number): DateRange;
/**
 * Zoom around a fixed date, so the day under the cursor stays put — what makes
 * zooming feel physical rather than a jump.
 */
export declare function zoomRange(range: DateRange, level: ZoomLevel, anchorDate: string): DateRange;
/** The zoom level whose span is closest to a range's width. */
export declare function levelForRange(range: DateRange): ZoomLevel;
export interface Tick {
    date: string;
    label: string;
    major: boolean;
}
/**
 * Axis ticks for a range. Density is chosen per level so labels never collide:
 * daily at day level, weekly at week, monthly at month, quarterly beyond.
 */
export declare function ticksFor(range: DateRange, level: ZoomLevel): Tick[];
export interface StatusSegment {
    from: string;
    to: string;
    status: TaskStatus;
}
export interface SegmentInput {
    created_on: string;
    completed_on: string | null;
    status_events: {
        status: TaskStatus;
        occurred_on: string;
    }[];
}
/**
 * Split a task's life into segments, one per interval between consecutive status
 * events, each carrying the status in force during it.
 *
 * This is what separates the view from a row of dots: a task that ran, stalled
 * for ten days, then finished reads as solid → dashed → solid, and the length of
 * the dashed stretch answers "how long was that blocked?".
 */
export declare function buildSegments(task: SegmentInput, todayDate: string): StatusSegment[];
export interface PointCluster<T> {
    x: number;
    items: T[];
}
/**
 * Group points that would overlap into one marker. Without this a busy week
 * becomes an unreadable smear.
 */
export declare function clusterPoints<T>(points: {
    x: number;
    item: T;
}[], minDistance: number): PointCluster<T>[];
/** Clamp a value to a range, used to keep clipped lines inside the plot. */
export declare function clamp(value: number, lo: number, hi: number): number;
//# sourceMappingURL=geometry.d.ts.map