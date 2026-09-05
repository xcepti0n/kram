import { existsSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4310);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');

/*
 * Named for what it is, not for what the product is called. The database, the
 * export format and the storage key all outlive any particular name — coupling
 * them to it means a future rename either drags a data migration behind it or
 * silently strands the old file and starts empty.
 */
const DATABASE_FILE = join(DATA_DIR, 'app.db');

/*
 * The database was named after the product until 2026-09-05. Adopt it rather
 * than starting empty beside it: a rename that appears to delete your data is
 * indistinguishable from data loss. The WAL and shm files move with it, since
 * SQLite locates them by the database's own name.
 */
for (const legacy of ['tasktracker.db', 'kram.db']) {
  const legacyPath = join(DATA_DIR, legacy);
  if (!existsSync(legacyPath) || existsSync(DATABASE_FILE)) continue;
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(legacyPath + suffix)) renameSync(legacyPath + suffix, DATABASE_FILE + suffix);
  }
  console.log(`Adopted existing database ${legacy} as app.db`);
}

const { server } = await buildApp({
  databaseFile: DATABASE_FILE,
  dataDir: DATA_DIR,
  serveStatic: true,
  logger: true,
});

try {
  await server.listen({ port: PORT, host: HOST });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close().then(() => process.exit(0));
  });
}
