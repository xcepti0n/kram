import type { CreateUpdateInput, ImportMode, SortMode, TaskStatus, TaskWithChildren, UpdateTaskInput } from '@tasktracker/shared';
export declare function usePages(): import("@tanstack/react-query").UseQueryResult<{
    id: string;
    name: string;
    colour: string;
    position: string;
    created_at: string;
}[], Error>;
export interface TaskListParams {
    page_id?: string;
    include_done?: boolean;
    sort?: SortMode;
}
export declare function useTasks(params: TaskListParams): import("@tanstack/react-query").UseQueryResult<{
    status: "done" | "todo" | "in_progress" | "blocked";
    title: string;
    id: string;
    colour: string;
    position: string;
    created_at: string;
    page_id: string;
    created_by: string;
    assigned_to: string | null;
    description: string | null;
    created_on: string;
    completed_on: string | null;
    location_label: string | null;
    location_lat: number | null;
    location_lng: number | null;
    updated_at: string;
}[], Error>;
export declare function useTask(id: string | null): import("@tanstack/react-query").UseQueryResult<{
    status: "done" | "todo" | "in_progress" | "blocked";
    title: string;
    id: string;
    colour: string;
    position: string;
    created_at: string;
    page_id: string;
    created_by: string;
    assigned_to: string | null;
    description: string | null;
    created_on: string;
    completed_on: string | null;
    location_label: string | null;
    location_lat: number | null;
    location_lng: number | null;
    updated_at: string;
    updates: {
        id: string;
        created_at: string;
        task_id: string;
        body: string;
        occurred_on: string;
        created_by: string;
    }[];
    status_events: {
        status: "done" | "todo" | "in_progress" | "blocked";
        id: string;
        created_at: string;
        task_id: string;
        occurred_on: string;
        changed_by: string;
    }[];
}, Error>;
export declare function useTimeline(params: {
    from?: string;
    to?: string;
    page_ids?: string;
    include_done?: boolean;
}): import("@tanstack/react-query").UseQueryResult<{
    range: {
        to: string;
        from: string;
    };
    pages: {
        id: string;
        name: string;
        colour: string;
        position: string;
    }[];
    tasks: {
        status: "done" | "todo" | "in_progress" | "blocked";
        title: string;
        id: string;
        colour: string;
        page_id: string;
        assigned_to: string | null;
        created_on: string;
        completed_on: string | null;
        updates: {
            id: string;
            body: string;
            occurred_on: string;
        }[];
        status_events: {
            status: "done" | "todo" | "in_progress" | "blocked";
            id: string;
            occurred_on: string;
        }[];
    }[];
}, Error>;
export declare function useSettings(): import("@tanstack/react-query").UseQueryResult<{
    user_id: string;
    theme: "calm" | "bold" | "dense";
    mode: "light" | "dark" | "system";
    density: "comfortable" | "compact";
    hide_done: boolean;
}, Error>;
export declare function useCreateTask(): import("@tanstack/react-query").UseMutationResult<{
    status: "done" | "todo" | "in_progress" | "blocked";
    title: string;
    id: string;
    colour: string;
    position: string;
    created_at: string;
    page_id: string;
    created_by: string;
    assigned_to: string | null;
    description: string | null;
    created_on: string;
    completed_on: string | null;
    location_label: string | null;
    location_lat: number | null;
    location_lng: number | null;
    updated_at: string;
    updates: {
        id: string;
        created_at: string;
        task_id: string;
        body: string;
        occurred_on: string;
        created_by: string;
    }[];
    status_events: {
        status: "done" | "todo" | "in_progress" | "blocked";
        id: string;
        created_at: string;
        task_id: string;
        occurred_on: string;
        changed_by: string;
    }[];
}, Error, {
    title: string;
    status?: "done" | "todo" | "in_progress" | "blocked" | undefined;
    colour?: string | undefined;
    page_id?: string | undefined;
    description?: string | null | undefined;
    created_on?: string | undefined;
    location_label?: string | null | undefined;
    location_lat?: number | null | undefined;
    location_lng?: number | null | undefined;
}, unknown>;
export declare function useUpdateTask(): import("@tanstack/react-query").UseMutationResult<{
    status: "done" | "todo" | "in_progress" | "blocked";
    title: string;
    id: string;
    colour: string;
    position: string;
    created_at: string;
    page_id: string;
    created_by: string;
    assigned_to: string | null;
    description: string | null;
    created_on: string;
    completed_on: string | null;
    location_label: string | null;
    location_lat: number | null;
    location_lng: number | null;
    updated_at: string;
    updates: {
        id: string;
        created_at: string;
        task_id: string;
        body: string;
        occurred_on: string;
        created_by: string;
    }[];
    status_events: {
        status: "done" | "todo" | "in_progress" | "blocked";
        id: string;
        created_at: string;
        task_id: string;
        occurred_on: string;
        changed_by: string;
    }[];
}, Error, {
    id: string;
    input: UpdateTaskInput;
}, {
    rollbackLists: () => void;
    previousTask: {
        status: "done" | "todo" | "in_progress" | "blocked";
        title: string;
        id: string;
        colour: string;
        position: string;
        created_at: string;
        page_id: string;
        created_by: string;
        assigned_to: string | null;
        description: string | null;
        created_on: string;
        completed_on: string | null;
        location_label: string | null;
        location_lat: number | null;
        location_lng: number | null;
        updated_at: string;
        updates: {
            id: string;
            created_at: string;
            task_id: string;
            body: string;
            occurred_on: string;
            created_by: string;
        }[];
        status_events: {
            status: "done" | "todo" | "in_progress" | "blocked";
            id: string;
            created_at: string;
            task_id: string;
            occurred_on: string;
            changed_by: string;
        }[];
    } | undefined;
}>;
export declare function useChangeStatus(): import("@tanstack/react-query").UseMutationResult<{
    status: "done" | "todo" | "in_progress" | "blocked";
    title: string;
    id: string;
    colour: string;
    position: string;
    created_at: string;
    page_id: string;
    created_by: string;
    assigned_to: string | null;
    description: string | null;
    created_on: string;
    completed_on: string | null;
    location_label: string | null;
    location_lat: number | null;
    location_lng: number | null;
    updated_at: string;
    updates: {
        id: string;
        created_at: string;
        task_id: string;
        body: string;
        occurred_on: string;
        created_by: string;
    }[];
    status_events: {
        status: "done" | "todo" | "in_progress" | "blocked";
        id: string;
        created_at: string;
        task_id: string;
        occurred_on: string;
        changed_by: string;
    }[];
}, Error, {
    id: string;
    status: TaskStatus;
    occurred_on?: string;
}, {
    rollbackLists: () => void;
}>;
export declare function useRepositionTask(): import("@tanstack/react-query").UseMutationResult<{
    status: "done" | "todo" | "in_progress" | "blocked";
    title: string;
    id: string;
    colour: string;
    position: string;
    created_at: string;
    page_id: string;
    created_by: string;
    assigned_to: string | null;
    description: string | null;
    created_on: string;
    completed_on: string | null;
    location_label: string | null;
    location_lat: number | null;
    location_lng: number | null;
    updated_at: string;
}, Error, {
    id: string;
    before_id?: string | null;
    after_id?: string | null;
    page_id?: string;
}, unknown>;
export declare function useDeleteTask(): import("@tanstack/react-query").UseMutationResult<void, Error, {
    status: "done" | "todo" | "in_progress" | "blocked";
    title: string;
    id: string;
    colour: string;
    position: string;
    created_at: string;
    page_id: string;
    created_by: string;
    assigned_to: string | null;
    description: string | null;
    created_on: string;
    completed_on: string | null;
    location_label: string | null;
    location_lat: number | null;
    location_lng: number | null;
    updated_at: string;
} | {
    status: "done" | "todo" | "in_progress" | "blocked";
    title: string;
    id: string;
    colour: string;
    position: string;
    created_at: string;
    page_id: string;
    created_by: string;
    assigned_to: string | null;
    description: string | null;
    created_on: string;
    completed_on: string | null;
    location_label: string | null;
    location_lat: number | null;
    location_lng: number | null;
    updated_at: string;
    updates: {
        id: string;
        created_at: string;
        task_id: string;
        body: string;
        occurred_on: string;
        created_by: string;
    }[];
    status_events: {
        status: "done" | "todo" | "in_progress" | "blocked";
        id: string;
        created_at: string;
        task_id: string;
        occurred_on: string;
        changed_by: string;
    }[];
}, {
    rollbackLists: () => void;
}>;
export declare function useAddUpdate(): import("@tanstack/react-query").UseMutationResult<{
    update: import("@tasktracker/shared").StatusUpdate;
    task: TaskWithChildren;
}, Error, {
    taskId: string;
    input: CreateUpdateInput;
}, {
    rollbackLists: () => void;
}>;
export declare function useEditUpdate(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
    created_at: string;
    task_id: string;
    body: string;
    occurred_on: string;
    created_by: string;
}, Error, {
    id: string;
    input: {
        body?: string;
        occurred_on?: string;
    };
}, unknown>;
export declare function useDeleteUpdate(): import("@tanstack/react-query").UseMutationResult<void, Error, string, unknown>;
export declare function useEditStatusEvent(): import("@tanstack/react-query").UseMutationResult<{
    status: "done" | "todo" | "in_progress" | "blocked";
    id: string;
    created_at: string;
    task_id: string;
    occurred_on: string;
    changed_by: string;
}, Error, {
    id: string;
    occurred_on: string;
}, unknown>;
export declare function useCreatePage(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
    name: string;
    colour: string;
    position: string;
    created_at: string;
}, Error, string, unknown>;
export declare function useUpdatePage(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
    name: string;
    colour: string;
    position: string;
    created_at: string;
}, Error, {
    id: string;
    name?: string;
    colour?: string;
}, {
    previous: {
        id: string;
        name: string;
        colour: string;
        position: string;
        created_at: string;
    }[] | undefined;
}>;
export declare function useRepositionPage(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
    name: string;
    colour: string;
    position: string;
    created_at: string;
}, Error, {
    id: string;
    before_id?: string | null;
    after_id?: string | null;
}, unknown>;
export declare function useDeletePage(): import("@tanstack/react-query").UseMutationResult<{
    movedOrDeleted: number;
}, Error, {
    id: string;
    policy: {
        tasks: "move";
        to: string;
    } | {
        tasks: "delete";
    };
}, unknown>;
export declare function useUpdateSettings(): import("@tanstack/react-query").UseMutationResult<{
    user_id: string;
    theme: "calm" | "bold" | "dense";
    mode: "light" | "dark" | "system";
    density: "comfortable" | "compact";
    hide_done: boolean;
}, Error, {
    theme?: "calm" | "bold" | "dense" | undefined;
    mode?: "light" | "dark" | "system" | undefined;
    density?: "comfortable" | "compact" | undefined;
    hide_done?: boolean | undefined;
}, {
    previous: {
        user_id: string;
        theme: "calm" | "bold" | "dense";
        mode: "light" | "dark" | "system";
        density: "comfortable" | "compact";
        hide_done: boolean;
    } | undefined;
}>;
export declare function useImport(): import("@tanstack/react-query").UseMutationResult<{
    mode: ImportMode;
    users: number;
    pages: number;
    tasks: number;
    updates: number;
    status_events: number;
    backup?: string;
}, Error, {
    doc: unknown;
    mode: ImportMode;
}, unknown>;
//# sourceMappingURL=hooks.d.ts.map