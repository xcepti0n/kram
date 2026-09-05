#!/usr/bin/env bash
#
# Kram — one-shot Proxmox LXC installer.
#
# Run this ON THE PROXMOX HOST (not inside a container). It creates an
# unprivileged LXC, installs Node and the app, and leaves a running systemd
# service behind.
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/<you>/kram/main/deploy/proxmox-install.sh)"
#
# Or, from a checkout on the host:
#
#   ./deploy/proxmox-install.sh
#
# Deliberately self-contained. The community-scripts framework sources
# build.func from its own repo at run time; that is a lot of convenience in
# exchange for making every future install depend on a third party still being
# reachable and still behaving the same way. This is one file you can read.

set -euo pipefail

# ------------------------------------------------------------------ config ---

APP="Kram"
REPO_URL="${REPO_URL:-}"           # set to your git remote, or leave empty to push from the laptop
BRANCH="${BRANCH:-main}"

# Defaults, all overridable from the environment:
#   CTID=121 DISK=8 CORES=2 RAM=1024 ./deploy/proxmox-install.sh
CTID="${CTID:-}"
HOSTNAME_="${HOSTNAME_:-kram}"
DISK="${DISK:-8}"                  # GB
CORES="${CORES:-2}"
RAM="${RAM:-1024}"                 # MB
BRIDGE="${BRIDGE:-vmbr0}"
NET="${NET:-dhcp}"                 # dhcp, or CIDR like 192.168.1.50/24
GATEWAY="${GATEWAY:-}"             # required when NET is not dhcp
STORAGE="${STORAGE:-}"             # auto-detected when empty
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
APP_PORT="${APP_PORT:-4310}"
NODE_MAJOR="${NODE_MAJOR:-26}"
START_ON_BOOT="${START_ON_BOOT:-1}"
OS_VERSION="${OS_VERSION:-12}"     # Debian 12 (bookworm)

# ------------------------------------------------------------------ output ---

RD=$'\033[01;31m'; GN=$'\033[1;92m'; YW=$'\033[33m'; BL=$'\033[36m'; CL=$'\033[m'
msg_info()  { echo -e " ${BL}➜${CL} $1"; }
msg_ok()    { echo -e " ${GN}✔${CL} $1"; }
msg_warn()  { echo -e " ${YW}!${CL} $1"; }
msg_error() { echo -e " ${RD}✘${CL} $1" >&2; }

header() {
  echo -e "${BL}"
  cat <<'EOF'
   _  __
  | |/ /  _ __  __ _  _ __ ___
  | ' /  | '__|/ _` || '_ ` _ \
  | . \  | |  | (_| || | | | | |
  |_|\_\ |_|   \__,_||_| |_| |_|

  Personal task tracker — Proxmox LXC installer
EOF
  echo -e "${CL}"
}

# Anything that fails should say where, not just stop.
trap 'msg_error "failed at line $LINENO: ${BASH_COMMAND}"' ERR

# ----------------------------------------------------------- preconditions ---

check_host() {
  if ! command -v pct >/dev/null 2>&1; then
    msg_error "\`pct\` not found — run this on the Proxmox host, not inside a container."
    exit 1
  fi
  if [[ $EUID -ne 0 ]]; then
    msg_error "must run as root on the Proxmox host."
    exit 1
  fi
  msg_ok "Proxmox host detected ($(pveversion 2>/dev/null | head -1))"
}

# Pick the next free CTID rather than colliding with an existing guest.
pick_ctid() {
  if [[ -n "$CTID" ]]; then
    if pct status "$CTID" >/dev/null 2>&1 || qm status "$CTID" >/dev/null 2>&1; then
      msg_error "ID $CTID is already in use."
      exit 1
    fi
    return
  fi
  CTID=$(pvesh get /cluster/nextid 2>/dev/null || echo 100)
  msg_ok "Using container ID $CTID"
}

# Find a storage that can actually hold a container rootfs. Not every storage
# can: 'local' is usually dir-backed for templates only, while rootfs needs a
# storage with the 'rootdir' content type.
pick_storage() {
  if [[ -n "$STORAGE" ]]; then
    msg_ok "Using storage $STORAGE (specified)"
    return
  fi
  STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')
  if [[ -z "$STORAGE" ]]; then
    msg_error "no active storage supports container rootfs. Pass STORAGE=<name>."
    pvesm status 2>/dev/null || true
    exit 1
  fi
  msg_ok "Using storage $STORAGE"
}

# Download the Debian template if the host does not already have one.
ensure_template() {
  local pattern="debian-${OS_VERSION}-standard"
  local existing
  existing=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk -v p="$pattern" '$1 ~ p {print $1; exit}')

  if [[ -n "$existing" ]]; then
    TEMPLATE="$existing"
    msg_ok "Template present: $(basename "$TEMPLATE")"
    return
  fi

  msg_info "Downloading Debian ${OS_VERSION} template…"
  pveam update >/dev/null 2>&1 || true
  local available
  available=$(pveam available -section system 2>/dev/null | awk -v p="$pattern" '$2 ~ p {print $2}' | sort -V | tail -1)
  if [[ -z "$available" ]]; then
    msg_error "no Debian ${OS_VERSION} template available from pveam."
    exit 1
  fi
  pveam download "$TEMPLATE_STORAGE" "$available" >/dev/null
  TEMPLATE="${TEMPLATE_STORAGE}:vztmpl/${available}"
  msg_ok "Template downloaded: $available"
}

# -------------------------------------------------------------- container ---

create_container() {
  local net="name=eth0,bridge=${BRIDGE}"
  if [[ "$NET" == "dhcp" ]]; then
    net="${net},ip=dhcp"
  else
    [[ -z "$GATEWAY" ]] && { msg_error "GATEWAY is required when NET is a static address."; exit 1; }
    net="${net},ip=${NET},gw=${GATEWAY}"
  fi

  msg_info "Creating container ${CTID}…"
  # Unprivileged: this app needs no kernel capabilities. Nesting is off for the
  # same reason — there is no Docker inside (DD-1).
  pct create "$CTID" "$TEMPLATE" \
    --hostname "$HOSTNAME_" \
    --cores "$CORES" \
    --memory "$RAM" \
    --swap 512 \
    --rootfs "${STORAGE}:${DISK}" \
    --net0 "$net" \
    --unprivileged 1 \
    --features nesting=0 \
    --onboot "$START_ON_BOOT" \
    --tags "kram;tasks" \
    --description "Kram — personal task tracker" >/dev/null

  pct start "$CTID" >/dev/null
  msg_ok "Container $CTID created and started"

  msg_info "Waiting for network…"
  local _
  for _ in $(seq 1 60); do
    if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
      msg_ok "Network is up"
      return
    fi
    sleep 2
  done
  msg_error "container has no network after 120s — check the bridge and DHCP."
  exit 1
}

# Run a command inside the container.
inct() { pct exec "$CTID" -- bash -c "$1"; }

install_base() {
  msg_info "Installing base packages…"
  inct "export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq curl ca-certificates git rsync sqlite3 >/dev/null"
  msg_ok "Base packages installed"

  msg_info "Installing Node ${NODE_MAJOR}…"
  # node:sqlite is the whole reason there is no build toolchain here (DD-20).
  inct "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - >/dev/null 2>&1
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null"

  local node_version major
  node_version=$(inct "node --version")
  major="${node_version#v}"; major="${major%%.*}"
  if (( major < 24 )); then
    msg_error "Node $node_version installed, but 24+ is required (node:sqlite, DD-20)."
    exit 1
  fi
  msg_ok "Node $node_version"
}

install_app() {
  msg_info "Creating service user…"
  inct "adduser --system --group --home /opt/kram --shell /usr/sbin/nologin kram >/dev/null 2>&1 || true
        mkdir -p /opt/kram/data"
  msg_ok "Service user created"

  if [[ -n "$REPO_URL" ]]; then
    msg_info "Cloning ${REPO_URL}…"
    inct "git clone --depth 1 --branch '$BRANCH' '$REPO_URL' /tmp/kram-src >/dev/null 2>&1
          cp -a /tmp/kram-src/. /opt/kram/ && rm -rf /tmp/kram-src"
    msg_ok "Source cloned"
  else
    # No remote: push the checkout this script is running from.
    local here
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    if [[ ! -f "$here/package.json" ]]; then
      msg_error "no REPO_URL set and no checkout found next to this script."
      msg_warn  "Either set REPO_URL=<git url>, or run this script from inside the repo."
      exit 1
    fi
    msg_info "Copying source from ${here}…"
    # tar over pct exec avoids needing ssh into the container.
    # *.tsbuildinfo must be excluded alongside dist: `tsc --build` trusts it,
    # sees a build it thinks is current, and emits nothing — leaving the web
    # build unable to resolve @kram/shared. Excluding the output but keeping
    # its receipt produces a tree that cannot build.
    tar -C "$here" \
      --exclude=node_modules --exclude=dist --exclude=dist-types \
      --exclude='*.tsbuildinfo' \
      --exclude=data --exclude=.git --exclude=.playwright-data \
      --exclude=test-results --exclude=playwright-report \
      -cf - . | pct exec "$CTID" -- tar -C /opt/kram -xf -
    msg_ok "Source copied"
  fi

  msg_info "Installing dependencies (no compiler needed — DD-20)…"
  inct "cd /opt/kram && npm ci --no-audit --no-fund >/dev/null 2>&1"
  msg_ok "Dependencies installed"

  msg_info "Building…"
  inct "cd /opt/kram && npm run build >/dev/null 2>&1"
  # Assert all three outputs. shared/dist is the one that fails silently: a
  # stale tsbuildinfo makes `tsc --build` a no-op, and the web build then
  # cannot resolve @kram/shared.
  if ! inct "test -f /opt/kram/shared/dist/index.js \
             && test -f /opt/kram/web/dist/index.html \
             && test -f /opt/kram/server/dist/index.js"; then
    msg_error "build did not produce the expected output."
    inct "cd /opt/kram && npm run build 2>&1 | tail -20" || true
    exit 1
  fi
  msg_ok "Build complete"

  inct "chown -R kram:kram /opt/kram"
}

configure_service() {
  msg_info "Configuring service…"

  inct "cat >/etc/kram.env <<'EOF'
PORT=${APP_PORT}
HOST=0.0.0.0
DATA_DIR=/opt/kram/data
NODE_ENV=production
EOF"

  # Prefer the unit from the repo, so there is one source of truth. Fall back to
  # an inline copy only if the checkout somehow lacks it.
  if inct "test -f /opt/kram/deploy/kram.service"; then
    inct "cp /opt/kram/deploy/kram.service /etc/systemd/system/kram.service"
  else
    msg_warn "deploy/kram.service missing from the checkout; writing a default unit."
    inct "cat >/etc/systemd/system/kram.service <<'EOF'
[Unit]
Description=Kram — personal task tracker
After=network-online.target
Wants=network-online.target
StartLimitBurst=5
StartLimitIntervalSec=60

[Service]
Type=simple
User=kram
Group=kram
WorkingDirectory=/opt/kram
EnvironmentFile=/etc/kram.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kram
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/kram/data

[Install]
WantedBy=multi-user.target
EOF"
  fi

  inct "systemctl daemon-reload && systemctl enable --now kram >/dev/null 2>&1"
  msg_ok "Service enabled"
}

verify() {
  msg_info "Verifying…"
  local _
  for _ in $(seq 1 45); do
    if inct "curl -sf localhost:${APP_PORT}/api/health >/dev/null 2>&1"; then
      msg_ok "Health check passed"
      # The UI is the half that only exists after a build, so check it too.
      if inct "curl -sf localhost:${APP_PORT}/ | grep -q '<title>'"; then
        msg_ok "UI is being served"
      else
        msg_warn "API is up but the UI did not respond — check: pct exec $CTID -- journalctl -u kram -n 50"
      fi
      return 0
    fi
    sleep 2
  done

  msg_error "service did not become healthy within 90s."
  echo
  inct "systemctl status kram --no-pager -l | head -20" || true
  inct "journalctl -u kram -n 30 --no-pager" || true
  exit 1
}

container_ip() {
  pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}'
}

finish() {
  local ip; ip=$(container_ip)
  echo
  msg_ok "${APP} is installed and running."
  echo
  echo -e "  ${GN}http://${ip}:${APP_PORT}${CL}"
  echo
  echo "  Container : $CTID ($HOSTNAME_)"
  echo "  Data      : /opt/kram/data/app.db"
  echo "  Config    : /etc/kram.env"
  echo
  echo "  Logs      : pct exec $CTID -- journalctl -u kram -f"
  echo "  Restart   : pct exec $CTID -- systemctl restart kram"
  echo "  Backup    : pct exec $CTID -- curl -s localhost:${APP_PORT}/api/export > kram-backup.json"
  echo
  msg_warn "No authentication yet — do not port-forward this. Reach it over the LAN or a VPN."
  if [[ "$NET" == "dhcp" ]]; then
    msg_warn "Address came from DHCP. Give $HOSTNAME_ a static lease so it does not move."
  fi
  echo
}

# -------------------------------------------------------------------- main ---

main() {
  header
  check_host
  pick_ctid
  pick_storage
  ensure_template
  create_container
  install_base
  install_app
  configure_service
  verify
  finish
}

main "$@"
