import { type TimelineResponse } from '@tasktracker/shared';
import { type DateRange } from './geometry.js';
interface Props {
    data: TimelineResponse;
    groupByPage: boolean;
    onSelectTask: (id: string) => void;
    onRangeChange: (range: DateRange) => void;
    range: DateRange;
}
export declare function Timeline({ data, groupByPage, onSelectTask, onRangeChange, range }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=Timeline.d.ts.map