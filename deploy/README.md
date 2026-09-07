# Deploying Kram to a Proxmox LXC

One Node process serves the API and the built UI on a single port (DD-3), managed by systemd
inside an unprivileged LXC. There is no Docker: the container *is* the LXC (DD-1).

Everything below assumes a Debian 12 or Ubuntu 24.04 container. Commands run as root unless noted.

---

## The short way

`deploy/proxmox-install.sh` does all of section 1–6 in one pass. Run it **on the Proxmox host**, as
root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/xcepti0n/kram/main/deploy/proxmox-install.sh)"
```

That clones the repo inside the container. To install from a local checkout instead — for testing a
change before pushing it — run it from the repo with `REPO_URL` emptied:

```bash
REPO_URL= ./deploy/proxmox-install.sh
```

Everything is overridable:

```bash
CTID=121 CORES=4 RAM=2048 DISK=16 APP_PORT=8080 ./deploy/proxmox-install.sh
NET=192.168.1.50/24 GATEWAY=192.168.1.1 ./deploy/proxmox-install.sh   # static IP
```

| Variable | Default | Notes |
| --- | --- | --- |
| `CTID` | next free | Fails rather than reusing an occupied ID |
| `HOSTNAME_` | `kram` | |
| `CORES` / `RAM` / `DISK` | 2 / 1024 MB / 8 GB | |
| `NET` / `GATEWAY` | `dhcp` | `GATEWAY` required for a static `NET` |
| `BRIDGE` | `vmbr0` | |
| `STORAGE` | auto | First active storage with `rootdir` content |
| `APP_PORT` | `4310` | Must be >1024 — the unit drops all capabilities |
| `NODE_MAJOR` | `26` | Must be ≥24 — the script refuses to continue otherwise |
| `REPO_URL` | `github.com/xcepti0n/kram` | Set to empty to copy the local checkout instead |
| `ROOT_PASSWORD` | *(none)* | Sets a container root password; without it the console auto-logs in |
| `SSH_KEY` | *(none)* | Installs openssh-server and this key for root; key-only, no password auth |
| `ASSUME_YES` | `0` | `1` skips the confirmation prompt |
| `KEEP_ON_FAIL` | `0` | `1` keeps a failed container for inspection instead of destroying it |

It shows the settings it is about to use and waits for you before creating anything:

```
  Container ID   <next free>
  Hostname       kram
  Cores          2
  RAM            1024 MB
  Disk           8 GB
  Network        dhcp  (bridge vmbr0)
  Storage        <auto-detect>
  App port       4310
  Node           26
  Source         https://github.com/xcepti0n/kram.git

  [D]efaults shown above, [C]ustomise, or [Q]uit? [D]:
```

`D` (or Enter) proceeds, `C` walks each field with the current value in brackets, `Q` exits without
creating anything. Set `ASSUME_YES=1` to skip the prompt; a run with no terminal attached skips it
automatically rather than hanging.

Then it creates the container, installs Node, builds, writes `/etc/kram.env` and the unit, starts
the service, and health-checks it before telling you the URL.

### Getting into the container

Two accounts, easily confused:

- **`root`** — how *you* get in. By default the Proxmox console auto-logs in as root and no password
  is set, which is what the community scripts do: reaching the console already requires access to
  the host. `pct enter <id>` from the host works regardless.
- **`kram`** — the unprivileged account the *service* runs as. It has `nologin` on purpose, the same
  way `www-data` and `postgres` do. Nobody logs in as it, and nothing is wrong if you cannot.

For a password instead of auto-login, or for SSH:

```bash
ROOT_PASSWORD='...' bash -c "$(curl -fsSL .../proxmox-install.sh)"
SSH_KEY="$(cat ~/.ssh/id_ed25519.pub)" bash -c "$(curl -fsSL .../proxmox-install.sh)"
```

`SSH_KEY` installs openssh-server and sets `PermitRootLogin prohibit-password`, so the key works and
password login over SSH does not. To add either afterwards, from the host:

```bash
pct set <id> --password              # prompts for a root password
pct exec <id> -- passwd root         # same thing from inside
``` If a step fails it prints the failing
line and the service logs rather than leaving you a half-built container.

The rest of this document is the manual version — worth reading if you want to know what the
script did, and what to do when something needs fixing later.

---

## 1. Create the container

In the Proxmox UI or shell. An **unprivileged** container is the right default — this app needs no
kernel capabilities.

```bash
pct create 110 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname kram \
  --cores 2 --memory 1024 --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 \
  --onboot 1
pct start 110
pct enter 110
```

2 cores and 1 GB is generous. The app idles at well under 100 MB; the headroom is for `npm ci`,
which is the heaviest thing that ever runs here.

Give it a static lease on your router once it boots, so the address stays put.

## 2. Install Node

**Node 24 or newer is required**, not optional: the app uses the built-in `node:sqlite` module
(DD-20), which is not stable before 24. `package.json` enforces this via `engines`.

```bash
apt update && apt install -y curl ca-certificates git
curl -fsSL https://deb.nodesource.com/setup_26.x | bash -
apt install -y nodejs
node --version   # expect v26.x
```

No build toolchain is needed. That is the entire point of DD-20 — `better-sqlite3` would have
required Python, make and a C++ compiler in this container, and would still have failed to build
against current V8.

## 3. Create the service user and layout

```bash
adduser --system --group --home /opt/kram --shell /usr/sbin/nologin kram
mkdir -p /opt/kram/data
```

`--system` gives a no-login account; the app never needs an interactive shell.

## 4. Get the code onto the container

Either works. Use **A** if the repo is on GitHub, **B** if it is still only on your laptop.

**A — from a git remote:**

```bash
cd /opt/kram
git clone https://github.com/xcepti0n/kram.git .
```

**B — straight from your laptop, no GitHub needed.** Run this *on the laptop*, from the repo:

```bash
# Push the working tree into the container. Excludes what the container rebuilds.
rsync -av --delete \
  --exclude node_modules --exclude dist --exclude dist-types \
  --exclude data --exclude .playwright-data --exclude test-results \
  ./ root@<container-ip>:/opt/kram/
```

If you do not have `rsync` in the container, `apt install -y rsync` there first. Without a remote,
updating later means re-running this command rather than `git pull`.

## 5. Build

Back on the container:

```bash
cd /opt/kram
npm ci
npm run build
chown -R kram:kram /opt/kram
```

`npm ci` installs dev dependencies too, because the build needs TypeScript and Vite. You can prune
them afterwards with `npm prune --omit=dev` if you care about the ~200 MB; the next deploy's
`npm ci` restores them.

Expect `npm ci` to finish without invoking a compiler. If it tries to build a native addon,
something has pulled in a dependency that defeats the point of DD-20.

## 6. Configure and start

```bash
cp deploy/kram.env.example /etc/kram.env
$EDITOR /etc/kram.env                       # set PORT / HOST if the defaults do not suit

cp deploy/kram.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kram
```

Check it came up:

```bash
systemctl status kram
curl -s localhost:4310/api/health           # {"status":"ok"}
```

Then open `http://<container-ip>:4310` from your laptop or phone.

## 7. Updating

If you installed from a git remote, one command does it, inside the container:

```bash
/opt/kram/deploy/update.sh
```

It exports a backup first, pulls, rebuilds, reinstalls the unit **if it changed** (a `git pull`
alone never updates `/etc`), restarts, and health-checks. If the new version does not come up it
rolls back to the commit that was running and says so. It refuses to run with uncommitted changes
in `/opt/kram` rather than overwriting them.

**There is no automatic updater, deliberately.** This rebuilds and restarts a service whose
migrations run on boot against the only copy of your data. Doing that unattended, at an hour when
nobody is watching, trades a real risk for the convenience of not typing one command. You are the
only user; there is no security-patch urgency that justifies it.

<details>
<summary>Or the manual steps</summary>

Whichever way you got the code there in step 4:

```bash
# A — if you cloned from a remote:
cd /opt/kram && git pull

# B — if you rsync'd: re-run the rsync from your laptop, then continue here.

# Both, on the container:
cd /opt/kram
npm ci
npm run build

# If deploy/kram.service changed in the update, copy it in as well — a pull
# updates the file in the repo, not the one systemd reads from /etc.
cp deploy/kram.service /etc/systemd/system/kram.service
systemctl daemon-reload

systemctl restart kram
systemctl status kram --no-pager
```

</details>

Migrations apply on boot, inside `openDatabase`, before the server accepts connections — so a
deploy that changes the schema needs no separate step and has no window where the port answers with
a half-migrated database. There is a test for exactly that (`server/src/deploy.test.ts`).

With the git path you can pull as the service user, avoiding another `chown`:

```bash
sudo -u kram git -C /opt/kram pull
```

---

## Backups

The data is one SQLite file: `/opt/kram/data/app.db`.

**The file is not safe to copy while the service is running** — SQLite keeps recent writes in
`app.db-wal`, so a plain `cp` can capture a torn database. Use one of these instead.

**JSON export (portable, human-readable, survives a schema change):**

```bash
curl -s localhost:4310/api/export > /root/kram-$(date +%F).json
```

This is the same document the Settings screen exports (FR-11), and it imports back through the same
screen. Prefer it for anything you want to keep long-term — it is the format that does not care what
version of the app wrote it.

**SQLite-level snapshot (exact, including soft-deleted rows):**

```bash
apt install -y sqlite3
sqlite3 /opt/kram/data/app.db ".backup '/root/kram-$(date +%F).db'"
```

`.backup` is WAL-aware and safe against a running server.

**Automate it** with a timer — daily at 03:00, keeping 30 days:

```bash
cat >/etc/systemd/system/kram-backup.service <<'EOF'
[Unit]
Description=Back up Kram to JSON

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'curl -sf localhost:4310/api/export > /var/backups/kram-$(date +%%F).json'
ExecStartPost=/bin/sh -c 'find /var/backups -name "kram-*.json" -mtime +30 -delete'
EOF

cat >/etc/systemd/system/kram-backup.timer <<'EOF'
[Unit]
Description=Daily Kram backup

[Timer]
OnCalendar=03:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

mkdir -p /var/backups
systemctl daemon-reload
systemctl enable --now kram-backup.timer
```

Note the `%%F`: systemd treats `%` as its own specifier prefix, so a literal one must be doubled.

Back these up off the container too. Proxmox's own scheduled container backup covers the whole
thing, and is the real answer to "what if the LXC is gone".

## Restore

**From JSON** — through the Settings screen (Import), or:

```bash
curl -sf -X POST localhost:4310/api/import?mode=replace \
  -H 'content-type: application/json' \
  --data @/var/backups/kram-2026-09-05.json
```

A pre-import backup is written to `data/backups/` automatically before anything is replaced, so an
import against the wrong file is recoverable.

**From a `.db` snapshot:**

```bash
systemctl stop kram
cp /root/kram-2026-09-05.db /opt/kram/data/app.db
rm -f /opt/kram/data/app.db-wal /opt/kram/data/app.db-shm
chown kram:kram /opt/kram/data/app.db
systemctl start kram
```

Removing the stale `-wal` and `-shm` matters: they belong to the database you just replaced, and
leaving them lets SQLite apply the old journal over the restored file.

---

## Reaching it from outside the house

Don't port-forward this. It has no authentication yet (parked, see
`.docs/IMPLEMENTATION.md`), so anything that can reach the port has full control of your data.

Use WireGuard into your home network and reach the container by its LAN address, which is what the
default `HOST=0.0.0.0` supports. Once you run the TLS setup below, the app moves to
`HOST=127.0.0.1` and everything goes through Caddy instead.

## HTTPS

The app speaks plain HTTP. `deploy/caddy-install.sh` puts Caddy in front of it, terminating TLS
with a certificate Caddy issues itself.

Run it inside the container:

```bash
cd /opt/kram && ./deploy/caddy-install.sh
```

It installs Caddy, writes `/etc/caddy/Caddyfile` from `deploy/Caddyfile`, switches
`/etc/kram.env` to `HOST=127.0.0.1`, restarts both services, and prints the trust steps below.
Re-running it is safe.

Setting `HOST=127.0.0.1` is the part that matters for security: while the app still listens on
`0.0.0.0`, `http://kram.vaibhavbhatia.net:4310` keeps working and quietly bypasses TLS. The
plaintext path has to actually close.

### Why a self-issued certificate

`kram.vaibhavbhatia.net` resolves only inside this network — it is an AdGuard rewrite pointing at
the container. A public CA will not sign for a name it cannot validate from the outside, and
Let's Encrypt says as much in their own [Certificates for localhost][le-localhost] note; their
advice for this exact case is to issue your own.

`tls internal` does that: Caddy runs a small CA inside the container, signs a certificate for this
host, and renews it indefinitely. No external service, no API token, nothing leaving the LAN.

The alternative — a publicly-trusted certificate with no per-device setup — needs DNS-01 validation
through the domain's registrar, and so a scoped API token living in the container. That trade was
not worth it here.

[le-localhost]: https://letsencrypt.org/docs/certificates-for-localhost/

### Trusting the certificate

Browsers will warn until the CA root is trusted. The connection is encrypted either way; the
warning is only about *who vouches for* the certificate. Do this once per device.

Copy the root out, from the Proxmox host:

```bash
pct pull $CTID \
  /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt \
  kram-root.crt
```

Then install it:

```bash
# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain kram-root.crt
```

- **iOS** — AirDrop it, install the profile, then turn it on under
  Settings → General → About → Certificate Trust Settings. The second step is easy to miss; the
  certificate does nothing until you enable it there.
- **Android** — Settings → Security → Encryption & credentials → Install a certificate → CA.
- **Firefox** — keeps its own trust store; import under Settings → Privacy & Security →
  Certificates → View Certificates → Authorities.

The root is valid for ten years. Leaf certificates rotate automatically and need no action.

### If HTTPS stops working

```bash
systemctl status caddy
journalctl -u caddy -n 50 --no-pager
caddy validate --config /etc/caddy/Caddyfile
curl -sk https://kram.vaibhavbhatia.net/api/health   # -k skips trust, tests the hop
```

A working `curl -k` with a browser that still complains means the CA root is not trusted on that
device — not a server problem.

`Connection refused` on 443 means Caddy is not running at all; the journal will say why. It exits
before binding anything if the config fails to load, so a config error looks identical to a
network problem from the client side.

One trap worth knowing: the Debian package runs Caddy under `ProtectSystem=full`, so `/var/log` is
read-only for it. A `log` directive writing to a file there fails at config load with
`permission denied` — and no `chown` fixes it, because the path is not writable at all in that
namespace. Leave logging on the default journald sink.

To back out of HTTPS entirely and return to plain HTTP on the LAN:

```bash
systemctl disable --now caddy
sed -i 's|^HOST=127.0.0.1|HOST=0.0.0.0|' /etc/kram.env
systemctl restart kram
```

## Troubleshooting

```bash
journalctl -u kram -f            # live logs
journalctl -u kram -n 100        # recent
systemctl status kram            # state, including a hit restart limit
```

**Blank page, UI never loads.** The build did not run or did not finish — `npm run build` writes
`web/dist`, and the server serves nothing without it. Check `ls /opt/kram/web/dist/index.html`.

**`Cannot find module` on start.** `npm ci` was skipped after a pull that changed dependencies, or
was run as the wrong user so `node_modules` is unreadable by `kram`.

**Permission denied writing the database.** `ReadWritePaths=/opt/kram/data` in the unit is the only
writable path, and the directory must be owned by `kram`. Re-run
`chown -R kram:kram /opt/kram/data`.

**Restarting in a loop, then stopping.** `StartLimitBurst` deliberately gives up after 5 failures in
60 seconds so the fault stays visible rather than churning. Read the logs, fix, then
`systemctl reset-failed kram && systemctl start kram`.

**`git pull` says "detected dubious ownership".** Git refuses to work on a repo owned by another
user. The install keeps `/opt/kram` root-owned for exactly this reason, but an older install
chowned the whole tree to `kram`. Fix it once:

```bash
chown -R root:root /opt/kram && chown -R kram:kram /opt/kram/data
```

or, if you would rather not change ownership, `git config --global --add safe.directory /opt/kram`.

**`status=226/NAMESPACE`, restarting until it gives up.** The unit contains mount-namespace
directives (`ProtectSystem`, `PrivateTmp`, `ProtectHome`, `ProtectKernel*`) that an unprivileged
LXC cannot honour (DD-29). Check the *installed* unit, not the repo's:

```bash
grep -nE '^(ProtectSystem|PrivateTmp|PrivateDevices|ProtectHome|ProtectKernel)' \
  /etc/systemd/system/kram.service
```

Any output means the old unit is still installed. A `git pull` updates the repo, never `/etc`:

```bash
cp /opt/kram/deploy/kram.service /etc/systemd/system/kram.service
systemctl daemon-reload && systemctl reset-failed kram && systemctl restart kram
```

**`uv_interface_addresses returned Unknown system error 97`.** Fastify enumerates network
interfaces when it logs the bound address, which goes through AF_NETLINK. An older unit set
`RestrictAddressFamilies`, which blocked it — the port bound successfully and then the process
exited. Update and reinstall the unit; the app also no longer treats this as fatal.

**Wrong Node version.** `node --version` below 24 means `node:sqlite` is missing or experimental and
the server will not start. Reinstall from the NodeSource repo above.
