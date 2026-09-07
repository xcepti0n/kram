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
const updateUnit = readFileSync(join(REPO, 'deploy', 'kram-update.service'), 'utf8');
const polkitRule = readFileSync(join(REPO, 'deploy', '49-kram-update.rules'), 'utf8');

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

/**
 * The update unit runs as root, which is exactly why its shape is worth
 * pinning down: a mistake here is a privilege mistake, not a availability one.
 */
describe('kram-update.service', () => {
  it('is a oneshot, so systemd waits for it rather than treating it as a daemon', () => {
    expect(updateUnit).toMatch(/^Type=oneshot$/m);
  });

  it('runs as root — it installs units and restarts services', () => {
    expect(updateUnit).toMatch(/^User=root$/m);
  });

  /*
   * The absence of [Install] is the point, not an omission. Enabling this unit
   * would run an update at every boot, so a power cut could silently change the
   * running version.
   */
  it('has no [Install] section, so it can never be enabled at boot', () => {
    // Section headers only. The unit names [Install] in a comment explaining
    // why it has none, and a substring match reads that as the section itself
    // — the same false positive that made the [Service] check wrong once.
    const sections = updateUnit
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('[') && line.endsWith(']'));
    expect(sections).not.toContain('[Install]');
    expect(updateUnit).not.toMatch(/^WantedBy=/m);
  });

  it('allows more memory than the app, because npm ci needs it', () => {
    const cap = updateUnit.match(/^MemoryMax=(\d+)([MG])$/m);
    expect(cap).not.toBeNull();
    const [, size, scale] = cap!;
    const mb = scale === 'G' ? Number(size) * 1024 : Number(size);
    expect(mb).toBeGreaterThan(512); // kram.service's ceiling
  });

  it('bounds its own runtime so a hung update does not wedge the service', () => {
    expect(updateUnit).toMatch(/^TimeoutStartSec=\d+$/m);
  });

  it('does not set mount-namespace directives either (DD-29)', () => {
    for (const name of NAMESPACE_DIRECTIVES) {
      expect(directives(updateUnit)).not.toContain(name);
    }
  });
});

describe('polkit rule', () => {
  /*
   * This grant is what lets an unprivileged process start a root unit. Each
   * clause narrows it; losing any one of them widens the grant well beyond
   * what the update feature needs.
   */
  it('is scoped to one unit, one verb and one user', () => {
    expect(polkitRule).toContain('"kram-update.service"');
    expect(polkitRule).toContain('"start"');
    expect(polkitRule).toContain('subject.user === "kram"');
  });

  it('never returns YES unconditionally', () => {
    // A rule that returns YES outside an if would authorise everything for
    // everyone — the single worst way this file could be wrong.
    const lines = polkitRule
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('*') && !l.startsWith('/*'));
    const yesIndex = lines.findIndex((l) => l.includes('polkit.Result.YES'));
    expect(yesIndex).toBeGreaterThan(-1);
    expect(lines.slice(0, yesIndex).join(' ')).toContain('if (');
  });
});

describe('installer and updater wiring', () => {
  it('the installer installs the update unit but never enables it', () => {
    expect(installer).toContain('kram-update.service');
    expect(installer).not.toMatch(/systemctl enable[^\n]*kram-update/);
  });

  it('update.sh installs the new unit and rule, so existing containers get them', () => {
    const updater = readFileSync(join(REPO, 'deploy', 'update.sh'), 'utf8');
    expect(updater).toContain('kram-update.service');
    expect(updater).toContain('49-kram-update.rules');
  });
});
