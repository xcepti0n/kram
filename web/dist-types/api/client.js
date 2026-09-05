export class ApiError extends Error {
    status;
    issues;
    constructor(status, message, issues) {
        super(message);
        this.status = status;
        this.issues = issues;
        this.name = 'ApiError';
    }
}
async function request(path, init) {
    // Only declare a JSON content-type when there is actually a body: Fastify
    // rejects `application/json` with an empty body, which would break every
    // DELETE and bodyless POST.
    const headers = { ...init?.headers };
    if (init?.body !== undefined && headers['content-type'] === undefined) {
        headers['content-type'] = 'application/json';
    }
    const response = await fetch(path, { ...init, headers });
    if (!response.ok) {
        let message = response.statusText;
        let issues;
        try {
            const body = (await response.json());
            message = body.error ?? message;
            issues = body.issues;
        }
        catch {
            /* non-JSON error body */
        }
        throw new ApiError(response.status, message, issues);
    }
    if (response.status === 204)
        return undefined;
    return (await response.json());
}
const qs = (params) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '')
            search.set(key, String(value));
    }
    const s = search.toString();
    return s ? `?${s}` : '';
};
export const api = {
    /* ------------------------------------------------------------ pages --- */
    listPages: () => request('/api/pages'),
    createPage: (input) => request('/api/pages', { method: 'POST', body: JSON.stringify(input) }),
    updatePage: (id, input) => request(`/api/pages/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    repositionPage: (id, input) => request(`/api/pages/${id}/position`, { method: 'PATCH', body: JSON.stringify(input) }),
    deletePage: (id, policy) => request(`/api/pages/${id}${qs(policy)}`, { method: 'DELETE' }),
    /* ----------------------------------------------------------- places --- */
    listPlaces: () => request('/api/places'),
    createPlace: (input) => request('/api/places', { method: 'POST', body: JSON.stringify(input) }),
    deletePlace: (id) => request(`/api/places/${id}`, { method: 'DELETE' }),
    /* ------------------------------------------------------------ tasks --- */
    listTasks: (params) => request(`/api/tasks${qs(params)}`),
    getTask: (id) => request(`/api/tasks/${id}`),
    createTask: (input) => request('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
    updateTask: (id, input) => request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    changeStatus: (id, status, occurred_on) => request(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, occurred_on }),
    }),
    repositionTask: (id, input) => request(`/api/tasks/${id}/position`, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
    restoreTask: (id) => request(`/api/tasks/${id}/restore`, { method: 'POST' }),
    /* ---------------------------------------------------------- updates --- */
    addUpdate: (taskId, input) => request(`/api/tasks/${taskId}/updates`, {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    editUpdate: (id, input) => request(`/api/updates/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteUpdate: (id) => request(`/api/updates/${id}`, { method: 'DELETE' }),
    restoreUpdate: (id) => request(`/api/updates/${id}/restore`, { method: 'POST' }),
    editStatusEvent: (id, occurred_on) => request(`/api/status-events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ occurred_on }),
    }),
    /* --------------------------------------------------------- timeline --- */
    timeline: (params) => request(`/api/timeline${qs(params)}`),
    /* --------------------------------------------------------- settings --- */
    getSettings: () => request('/api/settings'),
    updateSettings: (input) => request('/api/settings', { method: 'PATCH', body: JSON.stringify(input) }),
    /* ------------------------------------------------ export and import --- */
    exportUrl: (includeDeleted = false) => `/api/export${qs({ download: true, include_deleted: includeDeleted })}`,
    exportData: () => request('/api/export'),
    importData: (doc, mode) => request(`/api/import${qs({ mode })}`, { method: 'POST', body: JSON.stringify(doc) }),
};
/** Query keys, centralised so invalidation is consistent. */
export const keys = {
    pages: ['pages'],
    places: ['places'],
    tasks: (params = {}) => ['tasks', params],
    task: (id) => ['task', id],
    timeline: (params = {}) => ['timeline', params],
    settings: ['settings'],
};
//# sourceMappingURL=client.js.map