/**
 * SQLite access via Node's built-in `node:sqlite` (DD-20).
 *
 * This is a thin adapter rather than a dependency on `better-sqlite3`, which
 * needs a native build step: it has no prebuilt binary for Node 26 and fails to
 * compile against the current V8 API. `node:sqlite` ships with the runtime, so
 * `npm ci` on the Proxmox LXC needs no compiler, no Python, and no node-gyp —
 * which is what "building and running should be super easy" (NFR-1) actually
 * requires.
 *
 * The surface mirrors the small part of better-sqlite3 the app uses, so swapping
 * back later would be a change to this file alone.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  pragma(statement: string): unknown;
  /** Wrap a function so it runs inside a transaction, nesting via savepoints. */
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  close(): void;
}

/**
 * `node:sqlite` rejects `undefined` bindings, while the app's optional fields
 * naturally produce them. Normalising here keeps every call site from having to
 * remember, and booleans become integers as SQLite has no boolean type.
 */
function normalise(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

function wrapStatement(statement: StatementSync): Statement {
  return {
    run: (...params) => statement.run(...(normalise(params) as never[])) as RunResult,
    get: (...params) => statement.get(...(normalise(params) as never[])),
    all: (...params) => statement.all(...(normalise(params) as never[])),
  };
}

export function openSqlite(file: string): Database {
  const db = new DatabaseSync(file);

  // Prepared statements are cached: the hot paths re-run the same SQL, and
  // node:sqlite has no internal statement cache of its own.
  const cache = new Map<string, Statement>();

  let depth = 0;

  const database: Database = {
    prepare(sql: string): Statement {
      let statement = cache.get(sql);
      if (!statement) {
        statement = wrapStatement(db.prepare(sql));
        cache.set(sql, statement);
      }
      return statement;
    },

    exec(sql: string): void {
      db.exec(sql);
    },

    pragma(statement: string): unknown {
      // `PRAGMA x = y` returns a row for some pragmas and nothing for others;
      // prepare().get() handles both, where exec() would reject a result set.
      try {
        return db.prepare(`PRAGMA ${statement}`).get();
      } catch {
        db.exec(`PRAGMA ${statement}`);
        return undefined;
      }
    },

    transaction<T extends (...args: never[]) => unknown>(fn: T): T {
      return ((...args: never[]) => {
        // Nested calls use a savepoint so an inner failure unwinds only its own
        // work — the services layer composes transactional helpers freely.
        const isOuter = depth === 0;
        const savepoint = `sp_${depth}`;
        depth += 1;
        db.exec(isOuter ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
        try {
          const result = fn(...args);
          db.exec(isOuter ? 'COMMIT' : `RELEASE ${savepoint}`);
          return result;
        } catch (error) {
          if (isOuter) {
            db.exec('ROLLBACK');
          } else {
            db.exec(`ROLLBACK TO ${savepoint}`);
            db.exec(`RELEASE ${savepoint}`);
          }
          throw error;
        } finally {
          depth -= 1;
        }
      }) as T;
    },

    close(): void {
      cache.clear();
      db.close();
    },
  };

  return database;
}
