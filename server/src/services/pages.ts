import { randomUUID } from 'node:crypto';
import {
  between,
  needsRebalance,
  nextColour,
  rebalance,
  type CreatePageInput,
  type Page,
  type UpdatePageInput,
} from '@kram/shared';
import type { DB } from '../db/index.js';
import * as repo from '../repositories/index.js';
import { BadRequest, NotFound } from './tasks.js';

export function listPages(db: DB, userId: string): Page[] {
  return repo.listPages(db, userId);
}

export function createPage(db: DB, userId: string, input: CreatePageInput): Page {
  const existing = repo.listPages(db, userId);
  const last = existing[existing.length - 1];
  const now = new Date().toISOString();

  const page: Page = {
    id: randomUUID(),
    name: input.name,
    colour: input.colour ?? nextColour(existing.map((p) => p.colour)),
    position: between(last ? last.position : null, null),
    created_at: now,
  };

  repo.insertPage(db, page, userId);
  return page;
}

export function updatePage(
  db: DB,
  userId: string,
  pageId: string,
  input: UpdatePageInput,
): Page {
  if (!repo.getPage(db, userId, pageId)) throw new NotFound('page not found');
  repo.updatePage(db, pageId, input);
  return repo.getPage(db, userId, pageId)!;
}

export function repositionPage(
  db: DB,
  userId: string,
  pageId: string,
  input: { before_id?: string | null; after_id?: string | null },
): Page {
  if (!repo.getPage(db, userId, pageId)) throw new NotFound('page not found');

  const siblings = repo.listPages(db, userId).filter((p) => p.id !== pageId);
  const beforePos = input.before_id
    ? siblings.find((p) => p.id === input.before_id)?.position ?? null
    : null;
  const afterPos = input.after_id
    ? siblings.find((p) => p.id === input.after_id)?.position ?? null
    : null;

  if (input.before_id && beforePos === null) throw new BadRequest('before_id is not a visible page');
  if (input.after_id && afterPos === null) throw new BadRequest('after_id is not a visible page');

  const position =
    beforePos === null && afterPos === null
      ? between(siblings[siblings.length - 1]?.position ?? null, null)
      : between(beforePos, afterPos);

  db.transaction(() => {
    repo.updatePage(db, pageId, { position });
    const after = repo.listPages(db, userId);
    if (needsRebalance(after.map((p) => p.position))) {
      const fresh = rebalance(after.length);
      after.forEach((p, i) => repo.updatePage(db, p.id, { position: fresh[i]! }));
    }
  })();

  return repo.getPage(db, userId, pageId)!;
}

export type DeleteTaskPolicy = { kind: 'move'; to: string } | { kind: 'delete' };

/**
 * Delete a page, having been told explicitly what to do with its tasks.
 *
 * There is no default: tasks are never silently destroyed (FR-6.3), so the route
 * rejects a request that omits the policy rather than guessing. `delete` is a
 * soft delete, which keeps the whole operation undoable.
 */
export function deletePage(
  db: DB,
  userId: string,
  pageId: string,
  policy: DeleteTaskPolicy,
): { movedOrDeleted: number } {
  if (!repo.getPage(db, userId, pageId)) throw new NotFound('page not found');

  if (repo.countPages(db, userId) <= 1) {
    throw new BadRequest('cannot delete the only page');
  }

  const now = new Date().toISOString();
  let affected = 0;

  db.transaction(() => {
    if (policy.kind === 'move') {
      if (policy.to === pageId) throw new BadRequest('cannot move tasks to the page being deleted');
      if (!repo.getPage(db, userId, policy.to)) throw new NotFound('target page not found');
      affected = repo.moveTasksToPage(db, pageId, policy.to, now);
    } else {
      affected = repo.softDeleteTasksOnPage(db, pageId, now);
    }
    repo.softDeletePage(db, pageId, now);
  })();

  return { movedOrDeleted: affected };
}
