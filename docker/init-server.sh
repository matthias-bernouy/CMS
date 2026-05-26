#!/usr/bin/env bash
# init-server.sh — bootstrap a fresh Ubuntu 22.04 VPS for the bernouy CMS stack.
#
# Idempotent. Run as root.
#
# Usage:
#   sudo bash init-server.sh --role cms
#   sudo bash init-server.sh --role auth
#
# Flags:
#   --role <cms|auth>          required, picks role-specific extras.
#   --no-firewall              skip ufw setup (use if VPS provider firewall
#                              already handles it).
#
# What it does:
#   - apt: ca-certificates, curl, gnupg, openssl, jq, dnsutils, iproute2, ufw
#   - Docker CE (official repo) + containerd + buildx
#   - systemd-timesyncd (cert mTLS + lego need accurate clock)
#   - ufw: allow OpenSSH + 80 + 443

set -euo pipefail

ROLE=""
SKIP_FIREWALL=0

while [ $# -gt 0 ]; do
    case "$1" in
        --role) ROLE="${2:-}"; shift 2 ;;
        --role=*) ROLE="${1#*=}"; shift ;;
        --no-firewall) SKIP_FIREWALL=1; shift ;;
        -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 1 ;;
    esac
done

if [ "$EUID" -ne 0 ]; then
    echo "must run as root (use sudo)" >&2; exit 1
fi
case "$ROLE" in
    cms|auth) ;;
    "") echo "missing --role (cms|auth)" >&2; exit 1 ;;
    *)  echo "invalid --role '$ROLE' (expected cms|auth)" >&2; exit 1 ;;
esac

log() { printf "\n[init-server] %s\n" "$*"; }

# --- 1. Base packages
log "installing base tools"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg openssl jq dnsutils iproute2 ufw

# --- 2. Docker CE (official repo)
if ! command -v docker >/dev/null 2>&1; then
    log "installing Docker CE"
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
    systemctl enable --now docker
fi
docker --version

# --- 3. NTP
systemctl enable --now systemd-timesyncd

# --- 4. Firewall
if [ "$SKIP_FIREWALL" -eq 0 ]; then
    log "configuring ufw"
    ufw allow OpenSSH
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    ufw status verbose
else
    log "ufw skipped (--no-firewall)"
fi

log "done. role=${ROLE}"
echo
echo "Next steps:"
case "$ROLE" in
    cms)    echo "  → docker/cms-control-mt/DEPLOY.md §6" ;;
    auth)   echo "  → docker/auth/DEPLOY.md (à créer — voir conversation pour le shape)" ;;
esac
