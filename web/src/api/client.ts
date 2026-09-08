import type {
  ChecklistItem,
  CreateChecklistItemInput,
  CreatePageInput,
  CreateTaskInput,
  CreateUpdateInput,
  ExportDocument,
  ImportMode,
  CreatePlaceInput,
  Page,
  Place,
  Settings,
  SortMode,
  StatusEvent,
  StatusUpdate,
  Task,
  TaskStatus,
  TaskWithChildren,
  TimelineResponse,
  UpdateChecklistItemInput,
  UpdatePageInput,
  UpdateSettingsInput,
  UpdateStatus,
  UpdateTaskInput,
} from '@kram/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON content-type when there is actually a body: Fastify
  // rejects `application/json` with an empty body, which would break every
  // DELETE and bodyless POST.
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (init?.body !== undefined && headers['content-type'] === undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(path, { ...init, headers });

  if (!response.ok) {
    let message = response.statusText;
    let issues: { path: string; message: string }[] | undefined;
    try {
      const body = (await response.json()) as { error?: string; issues?: typeof issues };
      message = body.error ?? message;
      issues = body.issues;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, message, issues);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const qs = (params: Record<string, string | boolean | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

export const api = {
  /* ------------------------------------------------------------ pages --- */
  listPages: () => request<Page[]>('/api/pages'),

  createPage: (input: CreatePageInput) =>
    request<Page>('/api/pages', { method: 'POST', body: JSON.stringify(input) }),

  updatePage: (id: string, input: UpdatePageInput) =>
    request<Page>(`/api/pages/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  repositionPage: (id: string, input: { before_id?: string | null; after_id?: string | null }) =>
    request<Page>(`/api/pages/${id}/position`, { method: 'PATCH', body: JSON.stringify(input) }),

  deletePage: (id: string, policy: { tasks: 'move'; to: string } | { tasks: 'delete' }) =>
    request<{ movedOrDeleted: number }>(
      `/api/pages/${id}${qs(policy as Record<string, string>)}`,
      { method: 'DELETE' },
    ),

  /* ----------------------------------------------------------- places --- */
  listPlaces: () => request<(Place & { task_count: number })[]>('/api/places'),

  createPlace: (input: CreatePlaceInput) =>
    request<Place>('/api/places', { method: 'POST', body: JSON.stringify(input) }),

  deletePlace: (id: string) => request<void>(`/api/places/${id}`, { method: 'DELETE' }),

  /* ------------------------------------------------------------ tasks --- */
  listTasks: (params: {
    page_id?: string;
    include_done?: boolean;
    sort?: SortMode;
    location_label?: string;
  }) => request<Task[]>(`/api/tasks${qs(params)}`),

  getTask: (id: string) => request<TaskWithChildren>(`/api/tasks/${id}`),

  createTask: (input: CreateTaskInput) =>
    request<TaskWithChildren>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),

  updateTask: (id: string, input: UpdateTaskInput) =>
    request<TaskWithChildren>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  changeStatus: (id: string, status: TaskStatus, occurred_on?: string) =>
    request<TaskWithChildren>(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, occurred_on }),
    }),

  repositionTask: (
    id: string,
    input: { before_id?: string | null; after_id?: string | null; page_id?: string },
  ) => request<Task>(`/api/tasks/${id}/position`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  restoreTask: (id: string) =>
    request<TaskWithChildren>(`/api/tasks/${id}/restore`, { method: 'POST' }),

  /* ---------------------------------------------------------- updates --- */
  addUpdate: (taskId: string, input: CreateUpdateInput) =>
    request<{ update: StatusUpdate; task: TaskWithChildren }>(`/api/tasks/${taskId}/updates`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  editUpdate: (id: string, input: { body?: string; occurred_on?: string }) =>
    request<StatusUpdate>(`/api/updates/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteUpdate: (id: string) => request<void>(`/api/updates/${id}`, { method: 'DELETE' }),

  restoreUpdate: (id: string) =>
    request<StatusUpdate>(`/api/updates/${id}/restore`, { method: 'POST' }),

  editStatusEvent: (id: string, occurred_on: string) =>
    request<StatusEvent>(`/api/status-events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ occurred_on }),
    }),

  /* -------------------------------------------------------- checklist --- */

  /* Every mutation returns the task as well as the item: ticking an item also
     rewrites the day's summary update (DD-36), so the caller would otherwise
     have no way to know its timeline went stale. */

  addChecklistItem: (taskId: string, input: CreateChecklistItemInput) =>
    request<{ item: ChecklistItem; task: TaskWithChildren }>(`/api/tasks/${taskId}/checklist`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateChecklistItem: (id: string, input: UpdateChecklistItemInput) =>
    request<{ item: ChecklistItem; task: TaskWithChildren }>(`/api/checklist/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  moveChecklistItem: (id: string, before_id: string | null, after_id: string | null) =>
    request<{ item: ChecklistItem; task: TaskWithChildren }>(`/api/checklist/${id}/position`, {
      method: 'PATCH',
      body: JSON.stringify({ before_id, after_id }),
    }),

  deleteChecklistItem: (id: string) =>
    request<{ task: TaskWithChildren }>(`/api/checklist/${id}`, { method: 'DELETE' }),

  resetChecklist: (taskId: string) =>
    request<{ task: TaskWithChildren }>(`/api/tasks/${taskId}/checklist/reset`, { method: 'POST' }),

  /* --------------------------------------------------------- timeline --- */
  timeline: (params: {
    from?: string;
    to?: string;
    page_ids?: string;
    include_done?: boolean;
  }) => request<TimelineResponse>(`/api/timeline${qs(params)}`),

  /* --------------------------------------------------------- settings --- */
  getSettings: () => request<Settings>('/api/settings'),

  updateSettings: (input: UpdateSettingsInput) =>
    request<Settings>('/api/settings', { method: 'PATCH', body: JSON.stringify(input) }),

  /* ------------------------------------------------ export and import --- */
  exportUrl: (includeDeleted = false) =>
    `/api/export${qs({ download: true, include_deleted: includeDeleted })}`,

  exportData: () => request<ExportDocument>('/api/export'),

  importData: (doc: unknown, mode: ImportMode) =>
    request<{
      mode: ImportMode;
      users: number;
      pages: number;
      tasks: number;
      updates: number;
      status_events: number;
      backup?: string;
    }>(`/api/import${qs({ mode })}`, { method: 'POST', body: JSON.stringify(doc) }),

  /* --------------------------------------------------------- updates --- */

  checkUpdates: () => request<UpdateStatus>('/api/updates'),

  /**
   * Trigger an update. The X-Kram-Request header is required by the server:
   * applying an update runs privileged work and there is no login yet, so the
   * header is what distinguishes this call from a cross-site form post, which
   * cannot set custom headers. Removing it here returns 403.
   */
  applyUpdate: () =>
    request<{ started: boolean }>('/api/updates/apply', {
      method: 'POST',
      headers: { 'x-kram-request': '1' },
    }),
};

/** Query keys, centralised so invalidation is consistent. */
export const keys = {
  pages: ['pages'] as const,
  places: ['places'] as const,
  tasks: (params: object = {}) => ['tasks', params] as const,
  task: (id: string) => ['task', id] as const,
  timeline: (params: object = {}) => ['timeline', params] as const,
  settings: ['settings'] as const,
  updates: ['updates'] as const,
};
