/**
 * Server-state hooks (DD-7).
 *
 * Every mutation is optimistic: it applies to the cache immediately, so the UI
 * responds at once even over a VPN, and rolls back with a retry toast on failure.
 * Destructive actions are soft deletes surfaced as an undo toast rather than a
 * confirmation dialog — confirmation taxes every action to guard against a rare
 * mistake, undo taxes none and still recovers (FR-10.5).
 */
import { useMutation, useQuery, useQueryClient, } from '@tanstack/react-query';
import { api, keys } from './client.js';
import { useToast } from '../components/Toast.js';
/* ---------------------------------------------------------------- reads --- */
export function usePages() {
    return useQuery({ queryKey: keys.pages, queryFn: api.listPages });
}
export function useTasks(params) {
    return useQuery({
        queryKey: keys.tasks(params),
        queryFn: () => api.listTasks(params),
    });
}
export function useTask(id) {
    return useQuery({
        queryKey: keys.task(id ?? ''),
        queryFn: () => api.getTask(id),
        enabled: id !== null,
    });
}
export function useTimeline(params) {
    return useQuery({
        queryKey: keys.timeline(params),
        queryFn: () => api.timeline(params),
    });
}
export function usePlaces() {
    return useQuery({ queryKey: keys.places, queryFn: api.listPlaces });
}
export function useCreatePlace() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: (input) => api.createPlace(input),
        onSuccess: () => void client.invalidateQueries({ queryKey: keys.places }),
        onError: (error) => toast.show(`Could not save place — ${error.message}`, 'error'),
    });
}
export function useSettings() {
    return useQuery({ queryKey: keys.settings, queryFn: api.getSettings });
}
/* ----------------------------------------------------------- utilities --- */
/** Invalidate everything a task change could affect. Lists and the timeline are
 *  derived views of the same rows, so they always move together. */
function invalidateTaskViews(client) {
    void client.invalidateQueries({ queryKey: ['tasks'] });
    void client.invalidateQueries({ queryKey: ['timeline'] });
    void client.invalidateQueries({ queryKey: ['task'] });
}
/** Apply a function to every cached task list, wherever it is keyed. */
function patchTaskLists(client, fn) {
    const snapshots = client.getQueriesData({ queryKey: ['tasks'] });
    for (const [key, value] of snapshots) {
        if (value)
            client.setQueryData(key, fn(value));
    }
    return () => {
        for (const [key, value] of snapshots)
            client.setQueryData(key, value);
    };
}
/* ------------------------------------------------------------- writes --- */
export function useCreateTask() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: (input) => api.createTask(input),
        onSuccess: () => invalidateTaskViews(client),
        onError: (error) => toast.show(`Could not create task — ${error.message}`, 'error'),
    });
}
export function useUpdateTask() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ id, input }) => api.updateTask(id, input),
        onMutate: async ({ id, input }) => {
            await client.cancelQueries({ queryKey: ['tasks'] });
            const rollbackLists = patchTaskLists(client, (tasks) => tasks.map((t) => (t.id === id ? { ...t, ...input } : t)));
            const previousTask = client.getQueryData(keys.task(id));
            if (previousTask) {
                client.setQueryData(keys.task(id), { ...previousTask, ...input });
            }
            return { rollbackLists, previousTask };
        },
        onError: (error, { id }, context) => {
            context?.rollbackLists();
            if (context?.previousTask)
                client.setQueryData(keys.task(id), context.previousTask);
            toast.show(`Could not save — ${error.message}`, 'error');
        },
        onSettled: () => invalidateTaskViews(client),
    });
}
export function useChangeStatus() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ id, status, occurred_on, }) => api.changeStatus(id, status, occurred_on),
        onMutate: async ({ id, status, occurred_on }) => {
            await client.cancelQueries({ queryKey: ['tasks'] });
            // Mirror the server rule: done sets completed_on, anything else clears it.
            const completed_on = status === 'done' ? (occurred_on ?? todayString()) : null;
            const rollbackLists = patchTaskLists(client, (tasks) => tasks.map((t) => (t.id === id ? { ...t, status, completed_on } : t)));
            return { rollbackLists };
        },
        onError: (error, _vars, context) => {
            context?.rollbackLists();
            toast.show(`Could not change status — ${error.message}`, 'error');
        },
        onSettled: () => invalidateTaskViews(client),
    });
}
export function useRepositionTask() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ id, ...input }) => api.repositionTask(id, input),
        // The list has already been reordered locally by the drag handler, so there
        // is nothing to apply here — only a rollback path if the write fails.
        onError: (error) => {
            toast.show(`Could not reorder — ${error.message}`, 'error');
            invalidateTaskViews(client);
        },
        onSettled: () => invalidateTaskViews(client),
    });
}
export function useDeleteTask() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: (task) => api.deleteTask(task.id),
        onMutate: async (task) => {
            await client.cancelQueries({ queryKey: ['tasks'] });
            const rollbackLists = patchTaskLists(client, (tasks) => tasks.filter((t) => t.id !== task.id));
            return { rollbackLists };
        },
        onSuccess: (_data, task) => {
            // Soft deletion is what makes this honest: undo restores the original row
            // and all its children, not a copy.
            toast.show(`Deleted "${truncate(task.title)}"`, 'info', {
                label: 'Undo',
                onAction: async () => {
                    await api.restoreTask(task.id);
                    invalidateTaskViews(client);
                },
            });
        },
        onError: (error, _task, context) => {
            context?.rollbackLists();
            toast.show(`Could not delete — ${error.message}`, 'error');
        },
        onSettled: () => invalidateTaskViews(client),
    });
}
export function useAddUpdate() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ taskId, input }) => api.addUpdate(taskId, input),
        onMutate: async ({ taskId, input }) => {
            // A status change rides along with the note (DD-16), so the list must
            // reflect it immediately too.
            if (!input.status)
                return { rollbackLists: () => { } };
            const status = input.status;
            const completed_on = status === 'done' ? (input.occurred_on ?? todayString()) : null;
            const rollbackLists = patchTaskLists(client, (tasks) => tasks.map((t) => (t.id === taskId ? { ...t, status, completed_on } : t)));
            return { rollbackLists };
        },
        onError: (error, _vars, context) => {
            context?.rollbackLists();
            toast.show(`Could not add update — ${error.message}`, 'error');
        },
        onSettled: () => invalidateTaskViews(client),
    });
}
export function useEditUpdate() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ id, input }) => api.editUpdate(id, input),
        onSettled: () => invalidateTaskViews(client),
        onError: (error) => toast.show(`Could not save update — ${error.message}`, 'error'),
    });
}
export function useDeleteUpdate() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: (id) => api.deleteUpdate(id),
        onSuccess: (_data, id) => {
            toast.show('Update deleted', 'info', {
                label: 'Undo',
                onAction: async () => {
                    await api.restoreUpdate(id);
                    invalidateTaskViews(client);
                },
            });
        },
        onSettled: () => invalidateTaskViews(client),
        onError: (error) => toast.show(`Could not delete update — ${error.message}`, 'error'),
    });
}
export function useEditStatusEvent() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ id, occurred_on }) => api.editStatusEvent(id, occurred_on),
        onSettled: () => invalidateTaskViews(client),
        onError: (error) => toast.show(`Could not save date — ${error.message}`, 'error'),
    });
}
/* -------------------------------------------------------------- pages --- */
export function useCreatePage() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: (name) => api.createPage({ name }),
        onSettled: () => void client.invalidateQueries({ queryKey: keys.pages }),
        onError: (error) => toast.show(`Could not create page — ${error.message}`, 'error'),
    });
}
export function useUpdatePage() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ id, name, colour }) => api.updatePage(id, { name, colour }),
        onMutate: async ({ id, name, colour }) => {
            await client.cancelQueries({ queryKey: keys.pages });
            const previous = client.getQueryData(keys.pages);
            if (previous) {
                client.setQueryData(keys.pages, previous.map((p) => p.id === id ? { ...p, ...(name ? { name } : {}), ...(colour ? { colour } : {}) } : p));
            }
            return { previous };
        },
        onError: (error, _vars, context) => {
            if (context?.previous)
                client.setQueryData(keys.pages, context.previous);
            toast.show(`Could not save page — ${error.message}`, 'error');
        },
        onSettled: () => void client.invalidateQueries({ queryKey: keys.pages }),
    });
}
export function useRepositionPage() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...input }) => api.repositionPage(id, input),
        onSettled: () => void client.invalidateQueries({ queryKey: keys.pages }),
    });
}
export function useDeletePage() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ id, policy, }) => api.deletePage(id, policy),
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: keys.pages });
            invalidateTaskViews(client);
        },
        onError: (error) => toast.show(`Could not delete page — ${error.message}`, 'error'),
    });
}
/* ----------------------------------------------------------- settings --- */
export function useUpdateSettings() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: (input) => api.updateSettings(input),
        onMutate: async (input) => {
            await client.cancelQueries({ queryKey: keys.settings });
            const previous = client.getQueryData(keys.settings);
            if (previous)
                client.setQueryData(keys.settings, { ...previous, ...input });
            return { previous };
        },
        onError: (error, _input, context) => {
            if (context?.previous)
                client.setQueryData(keys.settings, context.previous);
            toast.show(`Could not save settings — ${error.message}`, 'error');
        },
        onSettled: () => void client.invalidateQueries({ queryKey: keys.settings }),
    });
}
/* ------------------------------------------------- export and import --- */
export function useImport() {
    const client = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: ({ doc, mode }) => api.importData(doc, mode),
        onSuccess: (result) => {
            void client.invalidateQueries();
            toast.show(`Imported ${result.tasks} task${result.tasks === 1 ? '' : 's'} and ${result.pages} page${result.pages === 1 ? '' : 's'}`, 'success');
        },
        onError: (error) => toast.show(`Import failed — ${error.message}`, 'error'),
    });
}
/* ---------------------------------------------------------- internals --- */
function todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function truncate(text, max = 40) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
//# sourceMappingURL=hooks.js.map