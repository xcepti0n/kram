#!/usr/bin/env bash
#
# Update a running Kram install. Run inside the container:
#
#   /opt/kram/deploy/update.sh
#
# Deliberately manual rather than a timer. This pulls code, rebuilds, and
# restarts a service whose migrations run on boot against the only copy of your
# data — that is not something to do unattended at 3am with nobody watching. It
# takes a backup first and rolls back if the new version fails to come up.

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/kram}"
UNIT="/etc/systemd/system/kram.service"
ENV_FILE="/etc/kram.env"

RD=$'\033[01;31m'; GN=$'\033[1;92m'; YW=$'\033[33m'; BL=$'\033[36m'; CL=$'\033[m'
msg_info()  { echo -e " ${BL}➜${CL} $1"; }
msg_ok()    { echo -e " ${GN}✔${CL} $1"; }
msg_warn()  { echo -e " ${YW}!${CL} $1"; }
msg_error() { echo -e " ${RD}✘${CL} $1" >&2; }

[[ $EUID -eq 0 ]] || { msg_error "run as root inside the container."; exit 1; }
[[ -d "$APP_DIR/.git" ]] || {
  msg_error "$APP_DIR is not a git checkout — this install was copied in, not cloned."
  msg_warn  "Re-copy the source from your laptop, then run the build steps in deploy/README.md."
  exit 1
}

cd "$APP_DIR"

PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE" 2>/dev/null | head -1)"
PORT="${PORT:-4310}"

# ------------------------------------------------------------------ backup ---
# Before anything else. A JSON export is portable across schema changes, which
# is exactly the property that matters when the update includes a migration.
BACKUP="/var/backups/kram-pre-update-$(date +%F-%H%M%S).json"
mkdir -p /var/backups
msg_info "Backing up…"
if curl -sf "localhost:${PORT}/api/export" -o "$BACKUP"; then
  msg_ok "Saved $BACKUP"
else
  msg_warn "Could not export (is the service running?). Continuing without a fresh backup."
  BACKUP=""
fi

# ------------------------------------------------------------------ update ---
BEFORE="$(git rev-parse HEAD)"
msg_info "Fetching…"
git fetch --quiet origin

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TARGET="$(git rev-parse "origin/${BRANCH}")"

if [[ "$BEFORE" == "$TARGET" ]]; then
  msg_ok "Already up to date ($(git log -1 --format=%h\ %s))"
  exit 0
fi

echo
git --no-pager log --oneline "${BEFORE}..${TARGET}" | sed 's/^/    /'
echo

# Uncommitted local edits would be silently destroyed by a hard reset.
if ! git diff --quiet || ! git diff --cached --quiet; then
  msg_error "there are uncommitted changes in $APP_DIR."
  msg_warn  "Commit, stash or discard them first — this update would overwrite them."
  exit 1
fi

msg_info "Updating to $(git rev-parse --short "$TARGET")…"
git merge --quiet --ff-only "$TARGET"

msg_info "Installing dependencies…"
npm ci --no-audit --no-fund >/dev/null 2>&1

msg_info "Building…"
npm run build >/dev/null 2>&1
# shared/dist is the one that fails quietly: a stale tsbuildinfo makes
# `tsc --build` a no-op and the web build then cannot resolve @kram/shared.
for artefact in shared/dist/index.js web/dist/index.html server/dist/index.js; do
  [[ -f "$artefact" ]] || { msg_error "build did not produce $artefact"; exit 1; }
done
chown -R kram:kram "$APP_DIR"
msg_ok "Built"

# The unit lives in /etc, so a pull alone never updates it. Skipping this is how
# a fix to the service file fails to reach a running install.
if ! cmp -s deploy/kram.service "$UNIT"; then
  msg_info "Service file changed — installing it…"
  cp deploy/kram.service "$UNIT"
  systemctl daemon-reload
  msg_ok "Unit updated"
fi

# ----------------------------------------------------------------- restart ---
msg_info "Restarting…"
systemctl reset-failed kram 2>/dev/null || true
systemctl restart kram

for _ in $(seq 1 30); do
  if curl -sf "localhost:${PORT}/api/health" >/dev/null 2>&1; then
    msg_ok "Healthy on $(git log -1 --format=%h\ %s)"
    [[ -n "$BACKUP" ]] && msg_info "Pre-update backup: $BACKUP"
    exit 0
  fi
  sleep 2
done

# -------------------------------------------------------------- roll back ---
# An update that leaves the service down is worse than no update. Go back to
# the commit that was running, rebuild it, and say so plainly.
msg_error "service did not come up within 60s — rolling back to ${BEFORE:0:7}."
# Must be a reset, not a merge: BEFORE is an ancestor of what is checked out,
# so --ff-only cannot reach it. `git reset --hard` moves the tree backwards,
# which is what a rollback is. Flags go before the revision — `--quiet` after it
# is treated as a pathspec and silently ignored.
git reset --hard --quiet "$BEFORE"
npm ci --no-audit --no-fund >/dev/null 2>&1
npm run build >/dev/null 2>&1
chown -R kram:kram "$APP_DIR"
cp deploy/kram.service "$UNIT" 2>/dev/null || true
systemctl daemon-reload
systemctl reset-failed kram 2>/dev/null || true
systemctl restart kram

for _ in $(seq 1 30); do
  if curl -sf "localhost:${PORT}/api/health" >/dev/null 2>&1; then
    msg_ok "Rolled back to ${BEFORE:0:7} and healthy."
    msg_warn "The update failed. Logs: journalctl -u kram -n 50"
    exit 1
  fi
  sleep 2
done

msg_error "rollback also failed to come up. The data is intact; the service is not running."
[[ -n "$BACKUP" ]] && msg_warn "Backup: $BACKUP"
msg_warn "Logs: journalctl -u kram -n 50"
exit 1
