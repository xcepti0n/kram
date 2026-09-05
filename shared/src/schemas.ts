import { z } from 'zod';

/**
 * Calendar date, `YYYY-MM-DD`. These are days as the user means them — no time,
 * no timezone. Storing an instant would drift a task to the previous day when
 * read from another timezone. See .docs/tasks/design.md §1.1.
 */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'not a real date');

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export const taskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatus>;

export const SORT_MODES = ['manual', 'created', 'status', 'title'] as const;
export const sortMode = z.enum(SORT_MODES);
export type SortMode = z.infer<typeof sortMode>;

export const THEMES = ['calm', 'bold', 'dense'] as const;
export const MODES = ['light', 'dark', 'system'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;

const id = z.string().min(1);
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb');

/* ---------------------------------------------------------------- pages --- */

export const pageSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  colour,
  position: z.string().min(1),
  created_at: z.string(),
});
export type Page = z.infer<typeof pageSchema>;

export const createPageInput = z.object({
  name: z.string().min(1).max(120),
  colour: colour.optional(),
});
export type CreatePageInput = z.infer<typeof createPageInput>;

export const updatePageInput = z
  .object({ name: z.string().min(1).max(120), colour })
  .partial();
export type UpdatePageInput = z.infer<typeof updatePageInput>;

/** Reorder by neighbour ids rather than an index, so a concurrent change
 *  elsewhere cannot silently misplace the row. See .docs/pages/design.md §3.2. */
export const positionInput = z
  .object({
    before_id: id.nullish(),
    after_id: id.nullish(),
    page_id: id.optional(),
  })
  .refine(
    (v) => v.before_id !== undefined || v.after_id !== undefined || v.page_id !== undefined,
    'provide before_id, after_id or page_id',
  );
export type PositionInput = z.infer<typeof positionInput>;

/* ---------------------------------------------------------------- tasks --- */

export const locationSchema = z.object({
  label: z.string().min(1).max(200).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});
export type TaskLocation = z.infer<typeof locationSchema>;

export const statusUpdateSchema = z.object({
  id,
  task_id: id,
  body: z.string().min(1).max(5000),
  occurred_on: isoDate,
  created_by: id,
  created_at: z.string(),
});
export type StatusUpdate = z.infer<typeof statusUpdateSchema>;

export const statusEventSchema = z.object({
  id,
  task_id: id,
  status: taskStatus,
  occurred_on: isoDate,
  changed_by: id,
  created_at: z.string(),
});
export type StatusEvent = z.infer<typeof statusEventSchema>;

export const taskSchema = z.object({
  id,
  page_id: id,
  created_by: id,
  assigned_to: id.nullable(),
  title: z.string().min(1).max(500),
  description: z.string().max(20000).nullable(),
  status: taskStatus,
  colour,
  position: z.string().min(1),
  created_on: isoDate,
  completed_on: isoDate.nullable(),
  location_label: z.string().max(200).nullable(),
  location_lat: z.number().nullable(),
  location_lng: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskWithChildren = taskSchema.extend({
  updates: z.array(statusUpdateSchema),
  status_events: z.array(statusEventSchema),
});
export type TaskWithChildren = z.infer<typeof taskWithChildren>;

/** Only `title` is required — every other field defaults server-side so the
 *  client can create a task from a bare title (FR-1.1). */
export const createTaskInput = z.object({
  title: z.string().min(1).max(500),
  page_id: id.optional(),
  description: z.string().max(20000).nullish(),
  status: taskStatus.optional(),
  colour: colour.optional(),
  created_on: isoDate.optional(),
  location_label: z.string().max(200).nullish(),
  location_lat: z.number().min(-90).max(90).nullish(),
  location_lng: z.number().min(-180).max(180).nullish(),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

export const updateTaskInput = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(20000).nullable(),
    colour,
    created_on: isoDate,
    page_id: id,
    assigned_to: id.nullable(),
    location_label: z.string().max(200).nullable(),
    location_lat: z.number().min(-90).max(90).nullable(),
    location_lng: z.number().min(-180).max(180).nullable(),
  })
  .partial();
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

export const changeStatusInput = z.object({
  status: taskStatus,
  occurred_on: isoDate.optional(),
});
export type ChangeStatusInput = z.infer<typeof changeStatusInput>;

/* -------------------------------------------------------------- updates --- */

/** A note and a state change are different facts, but they are entered
 *  together — passing `status` writes both rows in one transaction (DD-16). */
export const createUpdateInput = z.object({
  body: z.string().min(1).max(5000),
  occurred_on: isoDate.optional(),
  status: taskStatus.optional(),
});
export type CreateUpdateInput = z.infer<typeof createUpdateInput>;

export const editUpdateInput = z
  .object({ body: z.string().min(1).max(5000), occurred_on: isoDate })
  .partial();
export type EditUpdateInput = z.infer<typeof editUpdateInput>;

export const editStatusEventInput = z.object({ occurred_on: isoDate });
export type EditStatusEventInput = z.infer<typeof editStatusEventInput>;

/* ------------------------------------------------------------- settings --- */

export const settingsSchema = z.object({
  user_id: id,
  theme: z.enum(THEMES),
  mode: z.enum(MODES),
  density: z.enum(DENSITIES),
  hide_done: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsInput = settingsSchema.omit({ user_id: true }).partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;

/* ------------------------------------------------------------- timeline --- */

export const timelineTask = z.object({
  id,
  page_id: id,
  title: z.string(),
  colour,
  status: taskStatus,
  created_on: isoDate,
  completed_on: isoDate.nullable(),
  assigned_to: id.nullable(),
  status_events: z.array(
    z.object({ id, status: taskStatus, occurred_on: isoDate }),
  ),
  updates: z.array(z.object({ id, body: z.string(), occurred_on: isoDate })),
});
export type TimelineTask = z.infer<typeof timelineTask>;

export const timelineResponse = z.object({
  range: z.object({ from: isoDate, to: isoDate }),
  pages: z.array(z.object({ id, name: z.string(), colour, position: z.string() })),
  tasks: z.array(timelineTask),
});
export type TimelineResponse = z.infer<typeof timelineResponse>;

/* --------------------------------------------------------------- export --- */

export const EXPORT_FORMAT = 'tasktracker.export';
export const EXPORT_VERSION = 1;

export const exportDocument = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().positive(),
  exported_at: z.string(),
  users: z.array(z.object({ id, name: z.string(), created_at: z.string() })),
  pages: z.array(pageSchema.extend({ members: z.array(id) })),
  tasks: z.array(
    taskSchema.extend({
      deleted_at: z.string().nullish(),
      updates: z.array(statusUpdateSchema.extend({ deleted_at: z.string().nullish() })),
      status_events: z.array(statusEventSchema),
    }),
  ),
  settings: z.array(settingsSchema),
});
export type ExportDocument = z.infer<typeof exportDocument>;

export const IMPORT_MODES = ['merge', 'replace', 'duplicate'] as const;
export const importMode = z.enum(IMPORT_MODES);
export type ImportMode = z.infer<typeof importMode>;
