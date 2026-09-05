import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { DEFAULT_USER_ID, openDatabase, purgeDeleted, type DB } from './db/index.js';
import { registerRoutes } from './routes/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface AppOptions {
  /** SQLite file, or ':memory:' for tests. */
  databaseFile: string;
  dataDir: string;
  /** Serve the built SPA. Off in tests and in dev, where Vite serves it. */
  serveStatic?: boolean;
  logger?: boolean;
}

export interface App {
  server: FastifyInstance;
  db: DB;
}

/**
 * One process serves the API and the built frontend on a single port (DD-3):
 * one systemd unit, one port through the firewall, and no CORS.
 */
export async function buildApp(options: AppOptions): Promise<App> {
  const db = openDatabase(options.databaseFile);

  // Rows soft-deleted beyond the undo window are removed on boot; this is the
  // limit of how far back an undo can reach.
  purgeDeleted(db);

  const server = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 50 * 1024 * 1024, // large enough for an import of a full export
  });

  await registerRoutes(server, {
    db,
    userId: DEFAULT_USER_ID,
    dataDir: options.dataDir,
  });

  if (options.serveStatic) {
    const webRoot = findWebRoot();
    if (webRoot) {
      // `wildcard: true` lets the plugin serve nested paths such as
      // /assets/index-*.js. With it off, those fall through to the not-found
      // handler and are answered with index.html, which the browser then
      // rejects for having the wrong MIME type — a blank page.
      await server.register(fastifyStatic, { root: webRoot, wildcard: true });

      // SPA fallback: a non-API path that is not a real file renders the app,
      // so client-side routes survive a refresh.
      server.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api/')) {
          return reply.code(404).send({ error: 'not found' });
        }
        return reply.sendFile('index.html');
      });
    } else {
      server.log.warn('no built frontend found; run `npm run build` first');
    }
  }

  return { server, db };
}

function findWebRoot(): string | null {
  const candidates = [
    join(HERE, '..', '..', 'web', 'dist'),
    join(HERE, '..', '..', '..', 'web', 'dist'),
    resolve(process.cwd(), 'web', 'dist'),
  ];
  return candidates.find((p) => existsSync(join(p, 'index.html'))) ?? null;
}
