/**
 * The systemd unit (M9, DD-29).
 *
 * These assertions exist because the unit shipped broken twice: the deployment
 * target is an unprivileged LXC, and the directives that break it are perfectly
 * valid systemd that works on bare metal. Nothing in a syntax check or a local
 * run of the binary catches that — only knowing the target does.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const unit = readFileSync(join(REPO, 'deploy', 'kram.service'), 'utf8');
const installer = readFileSync(join(REPO, 'deploy', 'proxmox-install.sh'), 'utf8');

/** Directives implemented with a mount namespace, which the target cannot create. */
const NAMESPACE_DIRECTIVES = [
  'ProtectSystem',
  'PrivateTmp',
  'PrivateDevices',
  'ProtectHome',
  'ProtectKernelTunables',
  'ProtectKernelModules',
  'ProtectControlGroups',
  'ProtectProc',
  'PrivateUsers',
  'ReadWritePaths',
];

/** Directive lines only — a name inside a comment is documentation, not config. */
function directives(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.split('=', 1)[0]!);
}

describe('systemd unit', () => {
  it('has the three required sections', () => {
    for (const section of ['[Unit]', '[Service]', '[Install]']) {
      expect(unit).toContain(section);
    }
  });

  it.each(NAMESPACE_DIRECTIVES)(
    'does not set %s — an unprivileged LXC cannot create a mount namespace (DD-29)',
    (name) => {
      expect(directives(unit)).not.toContain(name);
    },
  );

  it('does not set those directives in the installer fallback unit either', () => {
    // The installer writes its own copy when the checkout lacks one; it drifted
    // out of sync with the real unit once already.
    for (const name of NAMESPACE_DIRECTIVES) {
      expect(installer).not.toMatch(new RegExp(`^${name}=`, 'm'));
    }
  });

  it('keeps the hardening that works without a namespace', () => {
    const present = directives(unit);
    for (const name of ['NoNewPrivileges', 'RestrictSUIDSGID', 'CapabilityBoundingSet']) {
      expect(present).toContain(name);
    }
  });

  it('does not set RestrictAddressFamilies', () => {
    /* It reads as if it only constrains the sockets the app opens, but Fastify
       enumerates interfaces on listen via AF_NETLINK. Blocking that killed the
       service after it had already bound the port (errno 97). */
    expect(directives(unit)).not.toContain('RestrictAddressFamilies');
    expect(installer).not.toMatch(/^RestrictAddressFamilies=/m);
  });

  it('puts StartLimit* in [Unit], where systemd reads them', () => {
    // In [Service] they are silently ignored, disabling the crash-loop guard.
    //
    // Sections must be found by matching a whole line: the file's own comments
    // mention "[Service]" in prose, and a naive indexOf finds the comment.
    const sectionOf = (name: string): string => {
      const lines = unit.split('\n');
      const start = lines.findIndex((line) => line.trim() === name);
      if (start === -1) return '';
      const rest = lines.slice(start + 1);
      const end = rest.findIndex((line) => /^\[.+\]$/.test(line.trim()));
      return (end === -1 ? rest : rest.slice(0, end)).join('\n');
    };

    expect(sectionOf('[Unit]')).toMatch(/^StartLimitBurst=/m);
    expect(sectionOf('[Unit]')).toMatch(/^StartLimitIntervalSec=/m);
    expect(sectionOf('[Service]')).not.toMatch(/^StartLimit/m);
  });

  it('runs as the service account, not root', () => {
    expect(unit).toMatch(/^User=kram$/m);
  });

  it('reads its configuration from the env file', () => {
    expect(unit).toMatch(/^EnvironmentFile=\/etc\/kram\.env$/m);
  });
});
