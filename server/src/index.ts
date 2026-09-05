import { join, resolve } from 'node:path';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4310);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');

const { server } = await buildApp({
  databaseFile: join(DATA_DIR, 'tasktracker.db'),
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
