/**
 * The update endpoints.
 *
 * The CSRF guard gets the most attention here. This app has no authentication,
 * so that guard is the only thing standing between "a page you visited" and
 * "root runs a build on your server" — if it regresses, nothing else catches
 * it, and the failure is silent from the user's side.
 */
import type { FastifyInstance } from 'fastify';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { checkForUpdates } from './services/updates.js';
import type { UpdateStatus } from '@kram/shared';

let server: FastifyInstance;

beforeEach(async () => {
  const app = await buildApp({ databaseFile: ':memory:', dataDir: '/tmp', logger: false });
  server = app.server;
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

describe('POST /api/updates/apply — cross-site protection', () => {
  it('rejects a request with no custom header', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/updates/apply' });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/X-Kram-Request/);
  });

  /*
   * The shape a real attack takes: a form on another site auto-submitting to
   * this endpoint. The browser sends the request but cannot add custom headers,
   * and labels the origin in Sec-Fetch-Site.
   */
  it('rejects a cross-site form post', async () => {
    // A form can only send one of three content types, none of which this
    // server parses — so Fastify answers 415 before the handler is reached.
    // That is a second, independent barrier and worth pinning down, but it is
    // not the one being tested here.
    const asForm = await server.inject({
      method: 'POST',
      url: '/api/updates/apply',
      headers: {
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    expect(asForm.statusCode).toBe(415);

    // With a content type the server does parse, the guard itself is what
    // rejects it. This is the assertion that matters: it fails if the guard is
    // removed, whereas the one above would still pass.
    const asJson = await server.inject({
      method: 'POST',
      url: '/api/updates/apply',
      headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
      payload: {},
    });
    expect(asJson.statusCode).toBe(403);
    expect(JSON.parse(asJson.body).error).toMatch(/cross-site/);
  });

  it('rejects a same-site request from a sibling subdomain', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/updates/apply',
      headers: { 'sec-fetch-site': 'same-site', 'x-kram-request': '1' },
    });
    expect(res.statusCode).toBe(403);
  });

  /*
   * The guard must not reject the app's own button. This is the request the UI
   * actually sends; a 403 here would mean the feature never works.
   */
  it('lets a same-origin request through to the availability check', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/updates/apply',
      headers: { 'sec-fetch-site': 'same-origin', 'x-kram-request': '1' },
    });
    // 409 because kram-update.service is not installed in the test environment.
    // The point is that it got past the guard: not a 403.
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).toBe(409);
  });

  it('allows a non-browser client that sets the header', async () => {
    // curl sends no Sec-Fetch-Site at all. That must not be treated as
    // cross-site, or the documented curl invocation would stop working.
    const res = await server.inject({
      method: 'POST',
      url: '/api/updates/apply',
      headers: { 'x-kram-request': '1' },
    });
    expect(res.statusCode).not.toBe(403);
  });
});

describe('GET /api/updates', () => {
  it('reports unknown rather than failing when not a git checkout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kram-nogit-'));
    const previous = process.env.APP_DIR;
    process.env.APP_DIR = dir;

    try {
      const status: UpdateStatus = await checkForUpdates();
      expect(status.state).toBe('unknown');
      expect(status.reason).toMatch(/not a git checkout/);
      expect(status.can_apply).toBe(false);
    } finally {
      process.env.APP_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /*
   * A checkout with no upstream must not present as up-to-date. Saying "you are
   * current" when the truth is "I could not tell" is the one wrong answer here.
   */
  it('reports unknown when the branch has no upstream', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kram-noremote-'));
    const git = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    git(['commit', '-q', '--allow-empty', '-m', 'initial']);

    const previous = process.env.APP_DIR;
    process.env.APP_DIR = dir;
    try {
      const status: UpdateStatus = await checkForUpdates();
      expect(status.state).toBe('unknown');
      expect(status.current).toHaveLength(40);
    } finally {
      process.env.APP_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
