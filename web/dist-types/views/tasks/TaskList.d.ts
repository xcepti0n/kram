import type { Page, Place, SortMode, Task, TaskStatus } from '@tasktracker/shared';
interface Props {
    tasks: Task[];
    pages: Page[];
    places?: Place[];
    sort: SortMode;
    showPageNames?: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onStatusChange: (id: string, status: TaskStatus) => void;
    onDelete: (task: Task) => void;
    onReorder: (id: string, before_id: string | null, after_id: string | null) => void;
    onCreate: (title: string) => void;
    composerPlaceholder?: string;
}
export declare function TaskList({ tasks, pages, places, sort, showPageNames, selectedId, onSelect, onStatusChange, onDelete, onReorder, onCreate, composerPlaceholder, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=TaskList.d.ts.map