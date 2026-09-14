/**
 * Serving the CA root (DD-41).
 *
 * The download is what lets a phone trust this host without a terminal, so the
 * bytes have to arrive intact and the fingerprint has to match what the device
 * will show — a mismatch would make the one verification step useless.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

let server: FastifyInstance;
let dir: string;
let certPath: string;

async function call(method: string, url: string) {
  const res = await server.inject({ method: method as 'GET', url });
  return { status: res.statusCode, body: res.body, headers: res.headers };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kram-ca-'));
  certPath = join(dir, 'kram-root.crt');

  // A real self-signed certificate, so the fingerprint assertion is against
  // openssl rather than against our own arithmetic.
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(dir, 'key.pem'),
    '-out', certPath,
    '-days', '1', '-subj', '/CN=Kram Test CA',
  ], { stdio: 'ignore' });

  process.env.CA_ROOT_PATH = certPath;
  const app = await buildApp({ databaseFile: ':memory:', dataDir: dir, logger: false });
  server = app.server;
});

afterEach(async () => {
  await server.close();
  delete process.env.CA_ROOT_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe('CA root download', () => {
  it('serves the certificate as a downloadable attachment', async () => {
    const res = await call('GET', '/api/ca-root');

    expect(res.status).toBe(200);
    expect(res.body).toContain('BEGIN CERTIFICATE');
    // Without the attachment disposition iOS renders it as text instead of
    // offering to install it, which is the whole point of the endpoint.
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('kram-root.crt');
    expect(res.headers['content-type']).toContain('x509');
  });

  it('serves bytes identical to the file on disk', async () => {
    const res = await call('GET', '/api/ca-root');
    const onDisk = execFileSync('cat', [certPath], { encoding: 'utf8' });
    expect(res.body).toBe(onDisk);
  });

  /* The fingerprint is the one check a person can actually perform against
     what their phone displays, so it must match openssl exactly. */
  it('reports the same SHA-256 fingerprint openssl does', async () => {
    const info = JSON.parse((await call('GET', '/api/ca-root/info')).body);
    expect(info.available).toBe(true);

    const expected = execFileSync(
      'openssl',
      ['x509', '-in', certPath, '-noout', '-fingerprint', '-sha256'],
      { encoding: 'utf8' },
    )
      .trim()
      .split('=')[1]!;

    expect(info.fingerprint).toBe(expected);
  });
});
