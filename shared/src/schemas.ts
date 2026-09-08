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

export const THEMES = ['calm', 'neon'] as const;
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

/* --------------------------------------------------------------- places --- */

/** Somewhere you return to (DD-23). Named once, attached to many tasks, and the
 *  unit a future "you are here, these match" panel queries against. */
export const placeSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  radius_m: z.number().int().min(10).max(50_000),
  created_at: z.string(),
});
export type Place = z.infer<typeof placeSchema>;

export const createPlaceInput = z.object({
  name: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  radius_m: z.number().int().min(10).max(50_000).optional(),
});
export type CreatePlaceInput = z.infer<typeof createPlaceInput>;

export const updatePlaceInput = z
  .object({
    name: z.string().min(1).max(120),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    radius_m: z.number().int().min(10).max(50_000),
  })
  .partial();
export type UpdatePlaceInput = z.infer<typeof updatePlaceInput>;

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
  place_id: id.nullable(),
  // Kept for a location that is a note rather than a place ("in the garage").
  location_label: z.string().max(200).nullable(),
  location_lat: z.number().nullable(),
  location_lng: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  /* Checklist progress for the row (DD-36). Computed in the list query rather
     than stored, and absent from the export — a count is derivable from the
     items themselves, so persisting it would be a second copy to keep true. */
  checklist_total: z.number().int().optional(),
  checklist_checked: z.number().int().optional(),
});
export type Task = z.infer<typeof taskSchema>;

/* A checklist item is a part of a task, not a task of its own (DD-36): the
   task already carries the page, status, timeline and update stream that a
   separate to-do entity would have had to duplicate. */
export const checklistItemSchema = z.object({
  id,
  task_id: id,
  text: z.string().min(1).max(500),
  position: z.string().min(1),
  added_on: isoDate,
  // Null while outstanding. Unchecking clears it, so the item returns to the
  // list without leaving a compensating entry behind.
  checked_on: isoDate.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const createChecklistItemInput = z.object({
  text: z.string().min(1).max(500),
  // Placement is optional: an item appended to the end needs neither neighbour.
  before_id: id.nullish(),
  after_id: id.nullish(),
});
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemInput>;

export const updateChecklistItemInput = z
  .object({
    text: z.string().min(1).max(500).optional(),
    // `checked` rather than a date: the client says what happened, the server
    // decides when, exactly as it does for a status change.
    checked: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemInput>;

export const taskWithChildren = taskSchema.extend({
  updates: z.array(statusUpdateSchema),
  status_events: z.array(statusEventSchema),
  checklist: z.array(checklistItemSchema),
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
  place_id: id.nullish(),
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
    place_id: id.nullable(),
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
  place_id: id.nullable().optional(),
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

/*
 * Deliberately not the product name. The discriminator identifies the *format*,
 * which outlives whatever the app is called; tying it to the name would mean
 * every rename invalidates every backup a user already holds.
 */
export const EXPORT_FORMAT = 'task-timeline.export.v1';
export const EXPORT_VERSION = 1;

/** Formats written under earlier product names. Import accepts them; export never writes them. */
export const LEGACY_EXPORT_FORMATS = ['tasktracker.export', 'kram.export'] as const;

export const exportDocument = z.object({
  format: z.union([
    z.literal(EXPORT_FORMAT),
    ...LEGACY_EXPORT_FORMATS.map((f) => z.literal(f)),
  ] as [z.ZodLiteral<string>, z.ZodLiteral<string>, ...z.ZodLiteral<string>[]]),
  version: z.number().int().positive(),
  exported_at: z.string(),
  users: z.array(z.object({ id, name: z.string(), created_at: z.string() })),
  pages: z.array(pageSchema.extend({ members: z.array(id) })),
  places: z.array(placeSchema.extend({ user_id: id })).optional(),
  tasks: z.array(
    taskSchema.extend({
      deleted_at: z.string().nullish(),
      updates: z.array(
        statusUpdateSchema.extend({
          deleted_at: z.string().nullish(),
          // Marks a generated checklist day-summary (DD-36). Declared here
          // because zod strips unknown keys: without it the export selects the
          // column and then silently drops it, and a restored summary is no
          // longer recognised as one.
          checklist_day: z.string().nullish(),
        }),
      ),
      status_events: z.array(statusEventSchema),
      // Optional, like `places`: a backup written before checklists existed is
      // still a valid document and must keep importing.
      checklist: z
        .array(checklistItemSchema.extend({ deleted_at: z.string().nullish() }))
        .optional(),
    }),
  ),
  settings: z.array(settingsSchema),
});
export type ExportDocument = z.infer<typeof exportDocument>;

export const IMPORT_MODES = ['merge', 'replace', 'duplicate'] as const;
export const importMode = z.enum(IMPORT_MODES);
export type ImportMode = z.infer<typeof importMode>;

/* ------------------------------------------------------------- updates --- */

export const updateCommit = z.object({
  sha: z.string(),
  subject: z.string(),
  date: z.string(),
});
export type UpdateCommit = z.infer<typeof updateCommit>;

/**
 * `state` is deliberately explicit rather than implied by counts. "Cannot
 * check" is a real state — no network, not a git checkout, no upstream — and
 * collapsing it into "up to date" would tell the user the opposite of the
 * truth.
 */
export const updateStatus = z.object({
  state: z.enum(['up-to-date', 'behind', 'unknown']),
  current: z.string(),
  current_subject: z.string().optional(),
  latest: z.string().optional(),
  behind_by: z.number().int().nonnegative(),
  commits: z.array(updateCommit),
  checked_at: z.string(),
  /** Why the state is 'unknown'. Shown to the user, so it must read plainly. */
  reason: z.string().optional(),
  /** False when the server cannot apply updates itself (no unit installed). */
  can_apply: z.boolean(),
});
export type UpdateStatus = z.infer<typeof updateStatus>;
