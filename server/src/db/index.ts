import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextColour, between, today } from '@tasktracker/shared';
import { openSqlite, type Database } from './sqlite.js';

export type DB = Database;

const HERE = dirname(fileURLToPath(import.meta.url));

/** Migrations live beside the built output in production and in the source tree
 *  in development; resolve whichever exists. */
function migrationsDir(): string {
  const candidates = [
    join(HERE, '..', '..', 'migrations'),
    join(HERE, '..', '..', '..', 'migrations'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`migrations directory not found (looked in ${candidates.join(', ')})`);
  return found;
}

export function openDatabase(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = openSqlite(file);
  // WAL lets readers run alongside a writer, which is all this workload needs.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  migrate(db);
  seed(db);
  return db;
}

/**
 * Apply pending migrations in filename order, inside a transaction each.
 * Runs on boot before the server accepts connections, so a deploy that changes
 * the schema needs no separate step (NFR-1.2).
 */
export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name),
  );

  const files = readdirSync(migrationsDir())
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir(), file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    })();
  }
}

/** The single user the app resolves for every request until authentication
 *  exists (DD-4). A fixed id keeps exports stable across environments. */
export const DEFAULT_USER_ID = 'user-default';

/**
 * Seed an empty database: one user, one page, and the membership row joining
 * them. Idempotent — safe to call on every boot.
 */
export function seed(db: DB): void {
  const now = new Date().toISOString();

  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(DEFAULT_USER_ID);
  if (!userExists) {
    db.prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)').run(
      DEFAULT_USER_ID,
      'Me',
      now,
    );
  }

  const settingsExist = db.prepare('SELECT 1 FROM settings WHERE user_id = ?').get(DEFAULT_USER_ID);
  if (!settingsExist) {
    db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(DEFAULT_USER_ID);
  }

  const anyPage = db
    .prepare(
      `SELECT 1 FROM pages p
       JOIN page_members m ON m.page_id = p.id
       WHERE m.user_id = ? AND p.deleted_at IS NULL`,
    )
    .get(DEFAULT_USER_ID);

  if (!anyPage) {
    const pageId = randomUUID();
    db.transaction(() => {
      db.prepare(
        'INSERT INTO pages (id, name, colour, position, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(pageId, 'Tasks', nextColour([]), between(null, null), now);
      db.prepare('INSERT INTO page_members (page_id, user_id, added_at) VALUES (?, ?, ?)').run(
        pageId,
        DEFAULT_USER_ID,
        now,
      );
    })();
  }
}

/**
 * Remove rows soft-deleted more than `days` ago. Undo relies on the row staying
 * present, so this window is the limit of how far back undo can reach.
 */
export function purgeDeleted(db: DB, days = 30): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const purge = db.transaction(() => {
    // Children first: status_updates of tasks that are themselves going away are
    // removed by the cascade, but standalone soft-deleted updates are not.
    const updates = db
      .prepare('DELETE FROM status_updates WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .run(cutoff).changes;
    const tasks = db
      .prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .run(cutoff).changes;
    const pages = db
      .prepare('DELETE FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .run(cutoff).changes;
    return updates + tasks + pages;
  });
  return purge();
}

export { randomUUID as newId, today };
