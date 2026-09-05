/**
 * HTTP layer. Routes validate input and delegate; business rules live in the
 * service layer and SQL lives in repositories. No route touches the database.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  changeStatusInput,
  createPageInput,
  createTaskInput,
  createUpdateInput,
  editStatusEventInput,
  editUpdateInput,
  importMode,
  positionInput,
  sortMode,
  updatePageInput,
  updateSettingsInput,
  updateTaskInput,
  type SortMode,
} from '@tasktracker/shared';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import * as repo from '../repositories/index.js';
import * as pages from '../services/pages.js';
import * as tasks from '../services/tasks.js';
import { buildTimeline } from '../services/timeline.js';
import { exportAll, importAll } from '../services/transfer.js';
import { BadRequest, NotFound } from '../services/tasks.js';

export interface RouteContext {
  db: DB;
  userId: string;
  dataDir: string;
}

/** Translate service errors into status codes in one place. */
function handle(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof NotFound) return reply.code(404).send({ error: error.message });
  if (error instanceof BadRequest) return reply.code(400).send({ error: error.message });
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: 'validation failed',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  throw error;
}

const boolish = (v: unknown): boolean | undefined => {
  if (v === undefined) return undefined;
  return v === 'true' || v === '1' || v === true;
};

export async function registerRoutes(app: FastifyInstance, ctx: RouteContext): Promise<void> {
  const { db, userId } = ctx;

  app.get('/api/health', async () => ({ status: 'ok' }));

  /* ------------------------------------------------------------- pages --- */

  app.get('/api/pages', async () => pages.listPages(db, userId));

  app.post('/api/pages', async (request, reply) => {
    try {
      const input = createPageInput.parse(request.body);
      return reply.code(201).send(pages.createPage(db, userId, input));
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>('/api/pages/:id', async (request, reply) => {
    try {
      const input = updatePageInput.parse(request.body);
      return pages.updatePage(db, userId, request.params.id, input);
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>('/api/pages/:id/position', async (request, reply) => {
    try {
      const input = positionInput.parse(request.body);
      return pages.repositionPage(db, userId, request.params.id, input);
    } catch (error) {
      return handle(reply, error);
    }
  });

  // Deleting requires saying what happens to the page's tasks. There is no
  // default — tasks are never silently destroyed (FR-6.3).
  app.delete<{ Params: { id: string }; Querystring: { tasks?: string; to?: string } }>(
    '/api/pages/:id',
    async (request, reply) => {
      try {
        const { tasks: policy, to } = request.query;
        if (policy === 'move') {
          if (!to) return reply.code(400).send({ error: 'move requires a target page: ?tasks=move&to=<id>' });
          return pages.deletePage(db, userId, request.params.id, { kind: 'move', to });
        }
        if (policy === 'delete') {
          return pages.deletePage(db, userId, request.params.id, { kind: 'delete' });
        }
        return reply.code(400).send({
          error: 'specify what happens to this page\'s tasks: ?tasks=move&to=<page_id> or ?tasks=delete',
        });
      } catch (error) {
        return handle(reply, error);
      }
    },
  );

  /* ------------------------------------------------------------- tasks --- */

  app.get<{
    Querystring: {
      page_id?: string;
      include_done?: string;
      assigned_to?: string;
      status?: string;
      location_label?: string;
      sort?: string;
    };
  }>('/api/tasks', async (request, reply) => {
    try {
      const q = request.query;
      const sort: SortMode = q.sort ? sortMode.parse(q.sort) : 'manual';
      return tasks.listTasks(db, userId, {
        pageId: q.page_id,
        includeDone: boolish(q.include_done),
        assignedTo: q.assigned_to,
        status: q.status ? (q.status as never) : undefined,
        locationLabel: q.location_label,
        sort,
      });
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const task = tasks.getTaskWithChildren(db, userId, request.params.id);
    if (!task) return reply.code(404).send({ error: 'task not found' });
    return task;
  });

  app.post('/api/tasks', async (request, reply) => {
    try {
      const input = createTaskInput.parse(request.body);
      return reply.code(201).send(tasks.createTask(db, userId, input));
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    try {
      const input = updateTaskInput.parse(request.body);
      return tasks.updateTask(db, userId, request.params.id, input);
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>('/api/tasks/:id/status', async (request, reply) => {
    try {
      const input = changeStatusInput.parse(request.body);
      return tasks.changeStatus(db, userId, request.params.id, input);
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>('/api/tasks/:id/position', async (request, reply) => {
    try {
      const input = positionInput.parse(request.body);
      return tasks.repositionTask(db, userId, request.params.id, input);
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    try {
      tasks.deleteTask(db, userId, request.params.id);
      return reply.code(204).send();
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/restore', async (request, reply) => {
    try {
      return tasks.restoreTask(db, userId, request.params.id);
    } catch (error) {
      return handle(reply, error);
    }
  });

  /* ----------------------------------------------------------- updates --- */

  app.post<{ Params: { id: string } }>('/api/tasks/:id/updates', async (request, reply) => {
    try {
      const input = createUpdateInput.parse(request.body);
      const { update, task } = tasks.addUpdate(db, userId, request.params.id, input);
      return reply.code(201).send({ update, task });
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>('/api/updates/:id', async (request, reply) => {
    try {
      const input = editUpdateInput.parse(request.body);
      return tasks.editUpdate(db, userId, request.params.id, input);
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/updates/:id', async (request, reply) => {
    try {
      tasks.deleteUpdate(db, userId, request.params.id);
      return reply.code(204).send();
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>('/api/updates/:id/restore', async (request, reply) => {
    try {
      return tasks.restoreUpdate(db, userId, request.params.id);
    } catch (error) {
      return handle(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>('/api/status-events/:id', async (request, reply) => {
    try {
      const input = editStatusEventInput.parse(request.body);
      return tasks.editStatusEvent(db, userId, request.params.id, input.occurred_on);
    } catch (error) {
      return handle(reply, error);
    }
  });

  /* ---------------------------------------------------------- timeline --- */

  app.get<{
    Querystring: {
      from?: string;
      to?: string;
      page_ids?: string;
      include_done?: string;
      assigned_to?: string;
    };
  }>('/api/timeline', async (request, reply) => {
    try {
      const q = request.query;
      return buildTimeline(db, userId, {
        from: q.from,
        to: q.to,
        pageIds: q.page_ids ? q.page_ids.split(',').filter(Boolean) : undefined,
        includeDone: boolish(q.include_done),
        assignedTo: q.assigned_to,
      });
    } catch (error) {
      return handle(reply, error);
    }
  });

  /* ---------------------------------------------------------- settings --- */

  app.get('/api/settings', async () => repo.getSettings(db, userId));

  app.patch('/api/settings', async (request, reply) => {
    try {
      const input = updateSettingsInput.parse(request.body);
      repo.updateSettings(db, userId, input);
      return repo.getSettings(db, userId);
    } catch (error) {
      return handle(reply, error);
    }
  });

  /* ------------------------------------------------- export and import --- */

  app.get<{ Querystring: { download?: string; include_deleted?: string } }>(
    '/api/export',
    async (request, reply) => {
      const doc = exportAll(db, boolish(request.query.include_deleted) ?? false);
      if (boolish(request.query.download)) {
        const name = `tasktracker-${new Date().toISOString().slice(0, 10)}.json`;
        reply.header('content-disposition', `attachment; filename="${name}"`);
      }
      return reply.type('application/json').send(JSON.stringify(doc, null, 2));
    },
  );

  app.post<{ Querystring: { mode?: string } }>('/api/import', async (request, reply) => {
    try {
      const mode = importMode.parse(request.query.mode ?? 'merge');
      return importAll(db, request.body, mode, ctx.dataDir);
    } catch (error) {
      return handle(reply, error);
    }
  });
}
