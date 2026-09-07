/**
 * The production boot path (M9, NFR-1).
 *
 * These spawn the built `server/dist/index.js` rather than calling `buildApp`,
 * because the things that break a deploy live in the entry point and only exist
 * once compiled: the data directory resolution, the legacy database adoption,
 * and the ordering of migrations against `listen`. Nothing else in the suite
 * exercises that file.
 */
import { execFileSync } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const ENTRY = join(REPO, 'server', 'dist', 'index.js');

/** A free-ish port per test, high enough to avoid anything else on the box. */
let nextPort = 4610;
const takePort = () => nextPort++;

interface Booted {
  child: ChildProcess;
  port: number;
}

/** Start the built server against a scratch data directory. */
function boot(dataDir: string): Booted {
  const port = takePort();
  const child = spawn(process.execPath, [ENTRY], {
    cwd: REPO,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' },
    stdio: 'ignore',
  });
  return { child, port };
}

/**
 * Poll from the instant the process starts and return the FIRST response that
 * connects. That is the assertion: if migrations ran after `listen`, this would
 * catch the window where the port answers but the schema is absent.
 */
async function firstResponse(port: number, path: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      return { status: response.status, body: await response.text() };
    } catch {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  throw new Error(`server on ${port} never answered ${path}`);
}

function stop(booted: Booted | undefined) {
  booted?.child.kill('SIGTERM');
}

describe('production boot', () => {
  let dir: string;

  beforeAll(() => {
    // The tests run the built entry point, so it has to exist.
    if (!existsSync(ENTRY)) {
      execFileSync('npm', ['run', 'build'], { cwd: REPO, stdio: 'ignore' });
    }
    dir = mkdtempSync(join(tmpdir(), 'kram-deploy-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves a migrated schema on the very first request that connects', async () => {
    const dataDir = join(dir, 'fresh');
    mkdirSync(dataDir, { recursive: true });
    const booted = boot(dataDir);

    try {
      // /api/pages requires the pages table and the seeded default page, so a
      // 200 here means migrations completed before the port opened.
      const first = await firstResponse(booted.port, '/api/pages');
      expect(first.status).toBe(200);
      expect(JSON.parse(first.body).length).toBeGreaterThan(0);
    } finally {
      stop(booted);
    }
  }, 30_000);

  /*
   * Fastify enumerates network interfaces on listen, to log the bound
   * addresses. In a container where that syscall is unavailable it throws
   * EAFNOSUPPORT from an event handler *after* the port is bound — so the app
   * was working and the process still exited 1. A log line must not be able to
   * take the service down.
   */
  it('survives a failure to enumerate network interfaces', async () => {
    const dataDir = join(dir, 'nointerfaces');
    mkdirSync(dataDir, { recursive: true });

    const preload = join(dataDir, 'preload.cjs');
    writeFileSync(
      preload,
      `const os = require('os');
       os.networkInterfaces = () => {
         const e = new Error('uv_interface_addresses returned Unknown system error 97');
         e.code = 'ERR_SYSTEM_ERROR';
         e.syscall = 'uv_interface_addresses';
         throw e;
       };`,
    );

    const port = takePort();
    const child = spawn(process.execPath, ['--require', preload, ENTRY], {
      cwd: REPO,
      env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' },
      stdio: 'ignore',
    });

    try {
      const response = await firstResponse(port, '/api/health');
      expect(response.status).toBe(200);
      expect(child.exitCode).toBeNull();
    } finally {
      child.kill('SIGTERM');
    }
  }, 30_000);

  it('creates its database inside DATA_DIR', async () => {
    const dataDir = join(dir, 'located');
    mkdirSync(dataDir, { recursive: true });
    const booted = boot(dataDir);

    try {
      await firstResponse(booted.port, '/api/health');
      expect(existsSync(join(dataDir, 'app.db'))).toBe(true);
    } finally {
      stop(booted);
    }
  }, 30_000);

  /*
   * The rename guard (DD-28). Naming the database after the product would have
   * made the TaskTracker → Kram rename look exactly like data loss: a new empty
   * database beside the real one. This asserts the old file is adopted.
   */
  it.each(['tasktracker.db', 'kram.db'])('adopts a legacy %s rather than starting empty', async (legacy) => {
    const dataDir = join(dir, `legacy-${legacy}`);
    mkdirSync(dataDir, { recursive: true });

    // Write a task into a database under the legacy name.
    const seeding = boot(dataDir);
    try {
      await firstResponse(seeding.port, '/api/health');
      const created = await fetch(`http://127.0.0.1:${seeding.port}/api/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'survives the rename' }),
      });
      expect(created.status).toBe(201);
    } finally {
      stop(seeding);
    }
    await new Promise((r) => setTimeout(r, 300));

    // Rename it to what an older install would have left behind.
    const { renameSync } = await import('node:fs');
    for (const suffix of ['', '-wal', '-shm']) {
      const from = join(dataDir, `app.db${suffix}`);
      if (existsSync(from)) renameSync(from, join(dataDir, `${legacy}${suffix}`));
    }

    // Boot again: the task must still be there.
    const upgraded = boot(dataDir);
    try {
      const response = await firstResponse(upgraded.port, '/api/tasks');
      expect(response.status).toBe(200);
      const titles = JSON.parse(response.body).map((t: { title: string }) => t.title);
      expect(titles).toContain('survives the rename');
      expect(existsSync(join(dataDir, 'app.db'))).toBe(true);
    } finally {
      stop(upgraded);
    }
  }, 40_000);
});
