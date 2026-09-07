#!/usr/bin/env bash
#
# Put HTTPS in front of Kram. Run INSIDE the container, as root:
#
#   /opt/kram/deploy/caddy-install.sh
#
# Installs Caddy, points it at the app, and switches Kram to listening on
# localhost only so that the plain-HTTP port is no longer reachable from the
# LAN. Safe to re-run; it converges on the same state.

set -Eeuo pipefail

DOMAIN="${DOMAIN:-kram.vaibhavbhatia.net}"
ENV_FILE="/etc/kram.env"
CADDYFILE="/etc/caddy/Caddyfile"
APP_DIR="${APP_DIR:-/opt/kram}"

RD=$'\033[01;31m'; GN=$'\033[1;92m'; YW=$'\033[33m'; BL=$'\033[36m'; CL=$'\033[m'
msg_info()  { echo -e " ${BL}➜${CL} $1"; }
msg_ok()    { echo -e " ${GN}✔${CL} $1"; }
msg_warn()  { echo -e " ${YW}!${CL} $1"; }
msg_error() { echo -e " ${RD}✘${CL} $1" >&2; }

[[ $EUID -eq 0 ]] || { msg_error "run as root inside the container."; exit 1; }
[[ -f "$ENV_FILE" ]] || { msg_error "$ENV_FILE not found — is Kram installed here?"; exit 1; }

APP_PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE" | head -1)"
APP_PORT="${APP_PORT:-4310}"

# ----------------------------------------------------------------- install ---
if ! command -v caddy >/dev/null 2>&1; then
  msg_info "Installing Caddy…"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg >/dev/null
  # The official repo. Keyring goes to /usr/share/keyrings and the source is
  # pinned to it, so this cannot silently start trusting a different signer.
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
  msg_ok "Caddy installed ($(caddy version | head -1))"
else
  msg_ok "Caddy already present ($(caddy version | head -1))"
fi

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

# --------------------------------------------------------------- configure ---
msg_info "Writing $CADDYFILE…"
mkdir -p /etc/caddy
sed -e "s|{\$KRAM_DOMAIN}|${DOMAIN}|g" \
    -e "s|{\$KRAM_PORT}|${APP_PORT}|g" \
    "${APP_DIR}/deploy/Caddyfile" > "$CADDYFILE"

# Fails loudly on a syntax error rather than at restart time.
caddy validate --config "$CADDYFILE" >/dev/null 2>&1 || {
  msg_error "Caddyfile did not validate:"
  caddy validate --config "$CADDYFILE" || true
  exit 1
}
msg_ok "Config valid"

# ------------------------------------------------------------- bind inward ---
# With a proxy in front, the app has no reason to accept LAN connections. If it
# still listened on 0.0.0.0 then http://host:4310 would keep working and quietly
# bypass TLS entirely — the plaintext path has to actually go away.
if grep -q '^HOST=0\.0\.0\.0' "$ENV_FILE"; then
  msg_info "Binding Kram to localhost…"
  sed -i 's|^HOST=0\.0\.0\.0|HOST=127.0.0.1|' "$ENV_FILE"
  systemctl restart kram
  msg_ok "Kram now listens on 127.0.0.1:${APP_PORT} only"
else
  msg_ok "Kram already bound to $(sed -n 's/^HOST=//p' "$ENV_FILE" | head -1)"
fi

# ------------------------------------------------------------------- start ---
msg_info "Starting Caddy…"
systemctl enable --now caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy

for _ in $(seq 1 20); do
  # --insecure only because we are talking to the local CA's own certificate
  # before its root has been trusted anywhere. It proves the TLS handshake and
  # the proxy hop work; it is not how clients will connect.
  if curl -skf "https://localhost/api/health" --resolve "${DOMAIN}:443:127.0.0.1" >/dev/null 2>&1 \
     || curl -skf "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    msg_ok "HTTPS is serving"
    break
  fi
  sleep 1
done

ROOT_CRT="/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt"

echo
msg_ok "Done — https://${DOMAIN}"
echo
msg_warn "One step left: trust the CA root on each device you browse from."
echo "  Copy it off the container (run this on your laptop):"
echo
echo "    pct pull \$CTID ${ROOT_CRT} kram-root.crt   # from the Proxmox host"
echo
echo "  macOS:  sudo security add-trusted-cert -d -r trustRoot \\"
echo "            -k /Library/Keychains/System.keychain kram-root.crt"
echo "  iOS:    AirDrop it, install the profile, then enable it under"
echo "          Settings > General > About > Certificate Trust Settings"
echo "  Android: Settings > Security > Encryption & credentials > Install a certificate > CA"
echo
echo "  Until then browsers will warn — the connection is still encrypted."
