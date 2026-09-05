import { type TaskStatus, type TaskWithChildren } from '@tasktracker/shared';
interface Props {
    task: TaskWithChildren;
    pageName?: string;
    onClose: () => void;
    onUpdate: (input: Record<string, unknown>) => void;
    onStatusChange: (status: TaskStatus, occurred_on?: string) => void;
    onAddUpdate: (body: string, occurred_on: string, status?: TaskStatus) => void;
    onEditUpdate: (id: string, input: {
        body?: string;
        occurred_on?: string;
    }) => void;
    onDeleteUpdate: (id: string) => void;
    onEditStatusEvent: (id: string, occurred_on: string) => void;
}
export declare function TaskSheet({ task, pageName, onClose, onUpdate, onStatusChange, onAddUpdate, onEditUpdate, onDeleteUpdate, onEditStatusEvent, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=TaskSheet.d.ts.map