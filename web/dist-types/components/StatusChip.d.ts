import { type TaskStatus } from '@tasktracker/shared';
export declare const STATUS_LABEL: Record<TaskStatus, string>;
interface Props {
    status: TaskStatus;
    onChange: (status: TaskStatus) => void;
    size?: 'sm' | 'md';
}
export declare function StatusChip({ status, onChange, size }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=StatusChip.d.ts.map