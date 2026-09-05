import { type Task } from '@tasktracker/shared';
interface Props {
    task: Task;
    pageColour?: string;
    pageName?: string;
    draggable: boolean;
    selected: boolean;
    onSelect: (id: string) => void;
    onStatusChange: (id: string, status: Task['status']) => void;
    onDelete: (task: Task) => void;
}
export declare function TaskRow({ task, pageColour, pageName, draggable, selected, onSelect, onStatusChange, onDelete, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=TaskRow.d.ts.map