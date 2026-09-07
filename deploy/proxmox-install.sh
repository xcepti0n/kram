#!/usr/bin/env bash
#
# Kram — one-shot Proxmox LXC installer.
#
# Run this ON THE PROXMOX HOST (not inside a container). It creates an
# unprivileged LXC, installs Node and the app, and leaves a running systemd
# service behind.
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/xcepti0n/kram/main/deploy/proxmox-install.sh)"
#
# Or, from a checkout on the host:
#
#   ./deploy/proxmox-install.sh
#
# Deliberately self-contained. The community-scripts framework sources
# build.func from its own repo at run time; that is a lot of convenience in
# exchange for making every future install depend on a third party still being
# reachable and still behaving the same way. This is one file you can read.

# -E matters: without it an ERR trap is not inherited by shell functions, so a
# failure inside install_app() would exit silently and leave the half-built
# container behind — which is exactly the case the trap exists for.
set -Eeuo pipefail

# ------------------------------------------------------------------ config ---

APP="Kram"
# Cloned inside the container. Set REPO_URL="" to copy a local checkout instead
# (useful for testing a change before pushing it).
REPO_URL="${REPO_URL-https://github.com/xcepti0n/kram.git}"
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
# Hostname to serve HTTPS on, e.g. kram.example.net. Empty means plain HTTP.
#
# Off by default deliberately. TLS here uses a certificate the container issues
# itself, which no device trusts until its CA root is imported — and enabling it
# closes the plain-HTTP port. Defaulting it on would hand a new install a
# browser warning and no obvious way back.
TLS_DOMAIN="${TLS_DOMAIN:-}"
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
# Set once the container exists, so a later failure can clean up after itself.
CREATED_CTID=""
TLS_READY=0

# A failed run must not leave a half-built container behind: the next attempt
# would allocate a fresh ID and leak this one. Destroy it unless KEEP_ON_FAIL=1,
# which is what you want when debugging the failure itself.
on_failure() {
  local code=$?
  msg_error "failed at line ${BASH_LINENO[0]}: ${BASH_COMMAND}"
  if [[ -n "$CREATED_CTID" ]]; then
    if [[ "${KEEP_ON_FAIL:-0}" == "1" ]]; then
      msg_warn "Container $CREATED_CTID left in place (KEEP_ON_FAIL=1)."
      msg_warn "Inspect: pct enter $CREATED_CTID    Remove: pct destroy $CREATED_CTID --force"
    else
      msg_warn "Removing the incomplete container ${CREATED_CTID}…"
      pct stop "$CREATED_CTID" >/dev/null 2>&1 || true
      pct destroy "$CREATED_CTID" --force >/dev/null 2>&1 || true
      msg_ok "Cleaned up. Re-run to try again, or set KEEP_ON_FAIL=1 to inspect."
    fi
  fi
  exit $code
}
trap on_failure ERR

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

  CREATED_CTID="$CTID"
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
#
# LC_ALL=C is set because pct exec passes the host's environment through, and a
# fresh Debian container has not generated en_US.UTF-8 — so every apt call
# emitted a wall of perl locale warnings. C is always present.
# `set -e` inside matters: these are multi-statement scripts, and bash -c
# otherwise returns only the last command's status — a failed clone followed by
# a successful `rm` would look like success.
inct() { pct exec "$CTID" -- env LC_ALL=C LANG=C bash -ec "$1"; }

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
    inct "git clone --depth 1 --branch '$BRANCH' '$REPO_URL' /tmp/kram-src >/dev/null
          cp -a /tmp/kram-src/. /opt/kram/
          rm -rf /tmp/kram-src"
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

  # Only the data directory belongs to the service account. The code stays
  # root-owned and world-readable: the service just reads it, and chowning the
  # whole tree makes git refuse to operate as root ("dubious ownership"), which
  # silently breaks `git pull` and therefore every update.
  inct "chown -R root:root /opt/kram
        chown -R kram:kram /opt/kram/data
        chmod 755 /opt/kram"
}

# Console and SSH access to the container itself.
#
# Two different accounts, easily confused:
#   root  — how *you* get into the container. Configured here.
#   kram  — the unprivileged account the service runs as. It has nologin on
#           purpose, the same way www-data and postgres do; nobody logs in as it.
#
# By default the Proxmox console is set to auto-login as root, matching what the
# community scripts do: the LXC boundary is the security control, and a console
# you cannot get into is a container you cannot debug. Set ROOT_PASSWORD to use
# a password instead, and SSH_KEY to add key-based ssh.
configure_access() {
  msg_info "Configuring container access…"

  if [[ -n "${ROOT_PASSWORD:-}" ]]; then
    inct "echo 'root:${ROOT_PASSWORD}' | chpasswd"
    msg_ok "Root password set"
  else
    # Auto-login on the console only. This is reachable from the Proxmox UI and
    # from `pct enter`, both of which already require host access.
    inct "mkdir -p /etc/systemd/system/container-getty@1.service.d
          cat >/etc/systemd/system/container-getty@1.service.d/autologin.conf <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 \$TERM
EOF
          systemctl daemon-reload
          systemctl restart container-getty@1.service 2>/dev/null || true"
    msg_ok "Console auto-login enabled (no password set)"
  fi

  if [[ -n "${SSH_KEY:-}" ]]; then
    inct "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server >/dev/null
          mkdir -p /root/.ssh && chmod 700 /root/.ssh
          echo '${SSH_KEY}' >> /root/.ssh/authorized_keys
          chmod 600 /root/.ssh/authorized_keys
          sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
          systemctl enable --now ssh >/dev/null 2>&1 || systemctl enable --now sshd >/dev/null 2>&1 || true"
    msg_ok "SSH key installed (key-based root login only)"
  fi
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
RestrictSUIDSGID=yes
RestrictRealtime=yes
LockPersonality=yes
RestrictNamespaces=yes
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
EOF"
  fi

  # Catch the namespace directives before starting rather than after five failed
  # restarts. They are valid systemd and valid on bare metal; they are only
  # wrong here, so a syntax check would never find them (DD-29).
  if inct "grep -qE '^(ProtectSystem|PrivateTmp|PrivateDevices|ProtectHome|ProtectKernel|ProtectControlGroups)' /etc/systemd/system/kram.service"; then
    msg_error "the unit contains mount-namespace directives, which an unprivileged LXC cannot honour."
    inct "grep -nE '^(ProtectSystem|PrivateTmp|PrivateDevices|ProtectHome|ProtectKernel|ProtectControlGroups)' /etc/systemd/system/kram.service" || true
    msg_warn "This unit would fail with status=226/NAMESPACE. Remove those lines (DD-29)."
    exit 1
  fi

  # The update unit and the polkit rule that lets the app trigger it. Both are
  # optional: without them the app still runs and still reports that an update
  # exists, it just cannot apply one from the UI and says so.
  if inct "test -f /opt/kram/deploy/kram-update.service"; then
    inct "cp /opt/kram/deploy/kram-update.service /etc/systemd/system/kram-update.service"
    # Not enabled, only installed. It is oneshot and triggered on demand;
    # enabling it would run an update at every boot.
    msg_ok "Update unit installed"
  else
    msg_warn "deploy/kram-update.service missing; updates will have to be applied by hand."
  fi

  if inct "test -f /opt/kram/deploy/49-kram-update.rules"; then
    # polkit only reads .rules from this directory, and only when it exists —
    # on a minimal container polkit may not be installed at all, in which case
    # the app falls back to reporting that it cannot apply updates.
    if inct "test -d /etc/polkit-1/rules.d"; then
      inct "cp /opt/kram/deploy/49-kram-update.rules /etc/polkit-1/rules.d/49-kram-update.rules"
      inct "systemctl restart polkit >/dev/null 2>&1 || true"
      msg_ok "Update permission granted to the app"
    else
      msg_warn "polkit is not installed; the UI cannot trigger updates."
      msg_warn "Apply them with: systemctl start kram-update"
    fi
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

  # A unit that never executes its binary fails differently from an app that
  # crashed, and the fix is different too. Name the case rather than dumping
  # logs and leaving the reader to spot it.
  # A unit that never executed its binary fails differently from an app that
  # crashed, and 226 is the one this deployment target produces. Name it.
  if inct "systemctl show kram -p ExecMainStatus --value | grep -qx 226" 2>/dev/null; then
    msg_error "systemd could not set up the unit's mount namespace (status 226)."
    msg_warn  "An unprivileged LXC cannot remount /proc, so ProtectSystem, PrivateTmp and"
    msg_warn  "the ProtectKernel* directives make the unit unstartable."
    echo
    # The installed unit is the one that matters, not the one in the repo.
    if inct "grep -qE '^(ProtectSystem|PrivateTmp|PrivateDevices|ProtectHome|ProtectKernel)' /etc/systemd/system/kram.service"; then
      msg_warn "The installed unit still contains those directives:"
      inct "grep -nE '^(ProtectSystem|PrivateTmp|PrivateDevices|ProtectHome|ProtectKernel)' /etc/systemd/system/kram.service" || true
      msg_warn "Remove them, then: systemctl daemon-reload && systemctl reset-failed kram && systemctl restart kram"
      echo
    fi
  fi

  inct "systemctl status kram --no-pager -l | head -20" || true
  inct "journalctl -u kram -n 30 --no-pager" || true
  exit 1
}

container_ip() {
  pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}'
}

# Put Caddy in front, terminating TLS with a certificate it issues itself.
#
# This shells out to deploy/caddy-install.sh rather than reimplementing it, so
# there is one description of the TLS setup and not two that drift apart. That
# script is idempotent and does its own verification.
configure_tls() {
  [[ -n "$TLS_DOMAIN" ]] || return 0

  msg_info "Setting up HTTPS for ${TLS_DOMAIN}…"
  # Not fatal: the app is installed and serving by this point. A TLS failure
  # should leave a working HTTP install behind and say so, not destroy the
  # container through the ERR trap.
  if inct "DOMAIN='${TLS_DOMAIN}' /opt/kram/deploy/caddy-install.sh"; then
    TLS_READY=1
    msg_ok "HTTPS ready"
  else
    msg_warn "HTTPS setup failed — the app is still running over plain HTTP."
    msg_warn "Re-run inside the container once fixed:"
    msg_warn "  DOMAIN=${TLS_DOMAIN} /opt/kram/deploy/caddy-install.sh"
  fi
}

finish() {
  local ip; ip=$(container_ip)
  echo
  msg_ok "${APP} is installed and running."
  echo
  if [[ "${TLS_READY:-0}" == "1" ]]; then
    echo -e "  ${GN}https://${TLS_DOMAIN}${CL}"
    echo
    echo "  Point ${TLS_DOMAIN} at ${ip} in your DNS if you have not already."
  else
    echo -e "  ${GN}http://${ip}:${APP_PORT}${CL}"
  fi
  echo
  echo "  Container : $CTID ($HOSTNAME_)"
  echo "  Data      : /opt/kram/data/app.db"
  echo "  Config    : /etc/kram.env"
  echo
  echo "  Logs      : pct exec $CTID -- journalctl -u kram -f"
  echo "  Restart   : pct exec $CTID -- systemctl restart kram"
  echo "  Backup    : pct exec $CTID -- curl -s localhost:${APP_PORT}/api/export > kram-backup.json"
  echo
  if [[ "${TLS_READY:-0}" == "1" ]]; then
    echo "  One step left — trust the CA root on each device you browse from."
    echo "  From this Proxmox host:"
    echo
    echo "    pct exec $CTID -- cat /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt > kram-root.crt"
    echo
    echo "  macOS: sudo security add-trusted-cert -d -r trustRoot \\"
    echo "           -k /Library/Keychains/System.keychain kram-root.crt"
    echo "  Others, and iOS's extra trust toggle: deploy/README.md"
    echo
  fi
  msg_warn "No authentication yet — do not port-forward this. Reach it over the LAN or a VPN."
  if [[ "$NET" == "dhcp" ]]; then
    msg_warn "Address came from DHCP. Give $HOSTNAME_ a static lease so it does not move."
  fi
  echo
}

# ------------------------------------------------------------------ review ---

# Read a line from the user's terminal.
#
# Not from stdin: under `bash -c "$(curl ...)"` stdin is not the keyboard, and
# under a piped `curl | bash` it is the script itself — reading it would eat the
# remaining source. /dev/tty is the terminal regardless of how stdin is wired.
ask() {
  local prompt="$1" default="$2" answer=""
  if [[ ! -r /dev/tty ]]; then
    echo "$default"
    return
  fi
  read -r -p "$prompt" answer </dev/tty || answer=""
  echo "${answer:-$default}"
}

show_settings() {
  local net_desc="$NET"
  [[ "$NET" != "dhcp" ]] && net_desc="$NET via $GATEWAY"
  local src_desc="$REPO_URL"
  [[ -z "$REPO_URL" ]] && src_desc="local checkout"

  echo
  echo "  Container ID   ${CTID:-<next free>}"
  echo "  Hostname       $HOSTNAME_"
  echo "  Cores          $CORES"
  echo "  RAM            ${RAM} MB"
  echo "  Disk           ${DISK} GB"
  echo "  Network        $net_desc  (bridge $BRIDGE)"
  echo "  Storage        ${STORAGE:-<auto-detect>}"
  echo "  App port       $APP_PORT"
  echo "  Node           $NODE_MAJOR"
  echo "  Source         $src_desc"
  echo "  HTTPS          ${TLS_DOMAIN:-off (plain HTTP)}"
  echo
}

customise() {
  echo
  echo "  Press Enter to keep the value shown in brackets."
  echo
  CTID=$(ask       "  Container ID [${CTID:-next free}]: " "$CTID")
  HOSTNAME_=$(ask  "  Hostname [$HOSTNAME_]: " "$HOSTNAME_")
  CORES=$(ask      "  Cores [$CORES]: " "$CORES")
  RAM=$(ask        "  RAM in MB [$RAM]: " "$RAM")
  DISK=$(ask       "  Disk in GB [$DISK]: " "$DISK")
  APP_PORT=$(ask   "  App port [$APP_PORT]: " "$APP_PORT")
  BRIDGE=$(ask     "  Bridge [$BRIDGE]: " "$BRIDGE")
  NET=$(ask        "  Network — 'dhcp' or CIDR e.g. 192.168.1.50/24 [$NET]: " "$NET")
  if [[ "$NET" != "dhcp" ]]; then
    GATEWAY=$(ask  "  Gateway [${GATEWAY:-required}]: " "$GATEWAY")
    while [[ -z "$GATEWAY" ]]; do
      msg_warn "A gateway is required with a static address."
      GATEWAY=$(ask "  Gateway: " "")
    done
  fi
  STORAGE=$(ask    "  Storage [${STORAGE:-auto}]: " "$STORAGE")
  echo
  echo "  HTTPS uses a certificate the container issues itself. You will need to"
  echo "  trust its CA root once per device. Leave blank for plain HTTP."
  TLS_DOMAIN=$(ask "  HTTPS hostname, e.g. kram.example.net [${TLS_DOMAIN:-none}]: " "$TLS_DOMAIN")
  # "none" is what the prompt shows when unset; treat it as the empty answer
  # rather than trying to serve a host literally called none.
  #
  # Written as if/fi, not `[[ ... ]] && ...`. As the last statement of a
  # function the && form returns the test's exit status, so a hostname that is
  # not "none" would make customise() return 1 — and with set -e plus the ERR
  # trap, that destroys the freshly built container.
  if [[ "${TLS_DOMAIN,,}" == "none" ]]; then
    TLS_DOMAIN=""
  fi

  # Numeric fields would otherwise fail deep inside `pct create`, where the
  # error says nothing about which value was wrong.
  local field
  for field in CORES RAM DISK APP_PORT; do
    if ! [[ "${!field}" =~ ^[0-9]+$ ]]; then
      msg_error "$field must be a number, got '${!field}'."
      exit 1
    fi
  done
  if [[ -n "$CTID" ]] && ! [[ "$CTID" =~ ^[0-9]+$ ]]; then
    msg_error "Container ID must be a number, got '$CTID'."
    exit 1
  fi
}

confirm_settings() {
  # Non-interactive by design: a run with no terminal (cron, a pipe with stdin
  # closed) proceeds on defaults rather than hanging forever waiting for input.
  if [[ "${ASSUME_YES:-0}" == "1" || ! -r /dev/tty ]]; then
    show_settings
    msg_info "Proceeding with these settings."
    return
  fi

  while true; do
    show_settings
    local reply
    reply=$(ask "  [D]efaults shown above, [C]ustomise, or [Q]uit? [D]: " "D")
    case "${reply,,}" in
      d|y|yes|"") return ;;
      c) customise ;;
      q|n|no) msg_info "Nothing was created."; exit 0 ;;
      *) msg_warn "Please answer D, C or Q." ;;
    esac
  done
}

# -------------------------------------------------------------------- main ---

main() {
  header
  check_host
  confirm_settings
  pick_ctid
  pick_storage
  ensure_template
  create_container
  install_base
  install_app
  configure_access
  configure_service
  verify
  configure_tls
  CREATED_CTID=""   # success — nothing to clean up
  finish
}

main "$@"
