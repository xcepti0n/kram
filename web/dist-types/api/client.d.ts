import type { CreatePageInput, CreateTaskInput, CreateUpdateInput, ImportMode, SortMode, StatusUpdate, TaskStatus, TaskWithChildren, UpdatePageInput, UpdateSettingsInput, UpdateTaskInput } from '@tasktracker/shared';
export declare class ApiError extends Error {
    status: number;
    issues?: {
        path: string;
        message: string;
    }[] | undefined;
    constructor(status: number, message: string, issues?: {
        path: string;
        message: string;
    }[] | undefined);
}
export declare const api: {
    listPages: () => Promise<{
        id: string;
        name: string;
        colour: string;
        position: string;
        created_at: string;
    }[]>;
    createPage: (input: CreatePageInput) => Promise<{
        id: string;
        name: string;
        colour: string;
        position: string;
        created_at: string;
    }>;
    updatePage: (id: string, input: UpdatePageInput) => Promise<{
        id: string;
        name: string;
        colour: string;
        position: string;
        created_at: string;
    }>;
    repositionPage: (id: string, input: {
        before_id?: string | null;
        after_id?: string | null;
    }) => Promise<{
        id: string;
        name: string;
        colour: string;
        position: string;
        created_at: string;
    }>;
    deletePage: (id: string, policy: {
        tasks: "move";
        to: string;
    } | {
        tasks: "delete";
    }) => Promise<{
        movedOrDeleted: number;
    }>;
    listTasks: (params: {
        page_id?: string;
        include_done?: boolean;
        sort?: SortMode;
        location_label?: string;
    }) => Promise<{
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
    }[]>;
    getTask: (id: string) => Promise<{
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
    }>;
    createTask: (input: CreateTaskInput) => Promise<{
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
    }>;
    updateTask: (id: string, input: UpdateTaskInput) => Promise<{
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
    }>;
    changeStatus: (id: string, status: TaskStatus, occurred_on?: string) => Promise<{
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
    }>;
    repositionTask: (id: string, input: {
        before_id?: string | null;
        after_id?: string | null;
        page_id?: string;
    }) => Promise<{
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
    }>;
    deleteTask: (id: string) => Promise<void>;
    restoreTask: (id: string) => Promise<{
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
    }>;
    addUpdate: (taskId: string, input: CreateUpdateInput) => Promise<{
        update: StatusUpdate;
        task: TaskWithChildren;
    }>;
    editUpdate: (id: string, input: {
        body?: string;
        occurred_on?: string;
    }) => Promise<{
        id: string;
        created_at: string;
        task_id: string;
        body: string;
        occurred_on: string;
        created_by: string;
    }>;
    deleteUpdate: (id: string) => Promise<void>;
    restoreUpdate: (id: string) => Promise<{
        id: string;
        created_at: string;
        task_id: string;
        body: string;
        occurred_on: string;
        created_by: string;
    }>;
    editStatusEvent: (id: string, occurred_on: string) => Promise<{
        status: "done" | "todo" | "in_progress" | "blocked";
        id: string;
        created_at: string;
        task_id: string;
        occurred_on: string;
        changed_by: string;
    }>;
    timeline: (params: {
        from?: string;
        to?: string;
        page_ids?: string;
        include_done?: boolean;
    }) => Promise<{
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
    }>;
    getSettings: () => Promise<{
        user_id: string;
        theme: "calm" | "bold" | "dense";
        mode: "light" | "dark" | "system";
        density: "comfortable" | "compact";
        hide_done: boolean;
    }>;
    updateSettings: (input: UpdateSettingsInput) => Promise<{
        user_id: string;
        theme: "calm" | "bold" | "dense";
        mode: "light" | "dark" | "system";
        density: "comfortable" | "compact";
        hide_done: boolean;
    }>;
    exportUrl: (includeDeleted?: boolean) => string;
    exportData: () => Promise<{
        pages: {
            members: string[];
            id: string;
            name: string;
            colour: string;
            position: string;
            created_at: string;
        }[];
        tasks: {
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
                deleted_at?: string | null | undefined;
            }[];
            status_events: {
                status: "done" | "todo" | "in_progress" | "blocked";
                id: string;
                created_at: string;
                task_id: string;
                occurred_on: string;
                changed_by: string;
            }[];
            deleted_at?: string | null | undefined;
        }[];
        format: "tasktracker.export";
        version: number;
        exported_at: string;
        users: {
            id: string;
            name: string;
            created_at: string;
        }[];
        settings: {
            user_id: string;
            theme: "calm" | "bold" | "dense";
            mode: "light" | "dark" | "system";
            density: "comfortable" | "compact";
            hide_done: boolean;
        }[];
    }>;
    importData: (doc: unknown, mode: ImportMode) => Promise<{
        mode: ImportMode;
        users: number;
        pages: number;
        tasks: number;
        updates: number;
        status_events: number;
        backup?: string;
    }>;
};
/** Query keys, centralised so invalidation is consistent. */
export declare const keys: {
    pages: readonly ["pages"];
    tasks: (params?: object) => readonly ["tasks", object];
    task: (id: string) => readonly ["task", string];
    timeline: (params?: object) => readonly ["timeline", object];
    settings: readonly ["settings"];
};
//# sourceMappingURL=client.d.ts.map