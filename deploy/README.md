# Deploying Kram to a Proxmox LXC

One Node process serves the API and the built UI on a single port (DD-3), managed by systemd
inside an unprivileged LXC. There is no Docker: the container *is* the LXC (DD-1).

Everything below assumes a Debian 12 or Ubuntu 24.04 container. Commands run as root unless noted.

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

## 4. First deploy

```bash
cd /opt/kram
git clone https://github.com/vaiibhav/kram.git .
npm ci
npm run build
chown -R kram:kram /opt/kram
```

`npm ci` installs dev dependencies too, because the build needs TypeScript and Vite. You can prune
them afterwards with `npm prune --omit=dev` if you care about the ~200 MB; the next deploy's
`npm ci` restores them.

## 5. Configure and start

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

## 6. Updating

```bash
cd /opt/kram
git pull
npm ci
npm run build
systemctl restart kram
```

Migrations apply on boot, inside `openDatabase`, before the server accepts connections — so a
deploy that changes the schema needs no separate step and has no window where the port answers with
a half-migrated database. There is a test for exactly that (`server/src/deploy.test.ts`).

Run it as the service user if you prefer not to `chown` afterwards:

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
default `HOST=0.0.0.0` supports. If you later put a reverse proxy in front for TLS, set
`HOST=127.0.0.1` so the app is only reachable through it.

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

**Wrong Node version.** `node --version` below 24 means `node:sqlite` is missing or experimental and
the server will not start. Reinstall from the NodeSource repo above.
