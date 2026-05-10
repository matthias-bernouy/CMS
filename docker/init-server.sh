#!/usr/bin/env bash
# init-server.sh — bootstrap a fresh Ubuntu 22.04 VPS for the bernouy CDN/CMS stack.
#
# Idempotent. Run as root.
#
# Usage:
#   sudo bash init-server.sh --role origin
#   sudo bash init-server.sh --role cms
#   sudo bash init-server.sh --role auth
#   sudo bash init-server.sh --role edge --origin-ip <ip>
#
# Flags:
#   --role <origin|edge|cms|auth>   required, picks role-specific extras.
#   --origin-ip <ip>           required for --role edge; tags an extra ufw
#                              rule for port 22 from the origin VPS (host
#                              sshd, used by lsyncd as the cdn-sync user).
#   --no-firewall              skip ufw setup (use if VPS provider firewall
#                              already handles it).
#
# What it does:
#   - apt: ca-certificates, curl, gnupg, openssl, jq, dnsutils, iproute2, ufw
#   - Docker CE (official repo) + containerd + buildx
#   - systemd-timesyncd (cert mTLS + lego need accurate clock)
#   - ufw: allow OpenSSH + 80 + 443; on edge: also tag port 22 from origin-ip
#   - Edge: pre-creates the cdn-sync user (lsyncd over SSH from origin)

set -euo pipefail

ROLE=""
ORIGIN_IP=""
SKIP_FIREWALL=0

while [ $# -gt 0 ]; do
    case "$1" in
        --role) ROLE="${2:-}"; shift 2 ;;
        --role=*) ROLE="${1#*=}"; shift ;;
        --origin-ip) ORIGIN_IP="${2:-}"; shift 2 ;;
        --origin-ip=*) ORIGIN_IP="${1#*=}"; shift ;;
        --no-firewall) SKIP_FIREWALL=1; shift ;;
        -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 1 ;;
    esac
done

if [ "$EUID" -ne 0 ]; then
    echo "must run as root (use sudo)" >&2; exit 1
fi
case "$ROLE" in
    origin|edge|cms|auth) ;;
    "") echo "missing --role (origin|edge|cms|auth)" >&2; exit 1 ;;
    *)  echo "invalid --role '$ROLE' (expected origin|edge|cms|auth)" >&2; exit 1 ;;
esac
if [ "$ROLE" = "edge" ] && [ -z "$ORIGIN_IP" ] && [ "$SKIP_FIREWALL" -eq 0 ]; then
    echo "missing --origin-ip <ip> (required for --role edge to tag port 22 from origin)" >&2; exit 1
fi

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
    if [ "$ROLE" = "edge" ]; then
        # Host sshd (port 22) is reachable from anywhere (ufw allow OpenSSH
        # above) so the operator can still admin the box. lsyncd from the
        # origin connects to this same sshd as the cdn-sync user, restricted
        # via authorized_keys (`from="<ip-origin>"` prefix recommended, cf.
        # cdn-edge/DEPLOY.md). This rule is informational / belt-and-suspenders;
        # the actual narrowing happens at the authorized_keys layer.
        ufw allow from "$ORIGIN_IP" to any port 22 proto tcp
    fi
    ufw --force enable
    ufw status verbose
else
    log "ufw skipped (--no-firewall)"
fi

# --- 5. Edge-specific: cdn-sync user for lsyncd over SSH from origin.
#       UID/GID 1099 fixed so the cdn-edge container's matching cdn-sync
#       (same UID/GID, baked in the Dockerfile) sees the same ownership
#       on the bind-mounted /var/lib/cdn — nginx (www-data, member of
#       cdn-sync group) reads blobs without any chmod dance.
if [ "$ROLE" = "edge" ]; then
    log "edge setup: cdn-sync user (uid/gid 1099)"
    if ! getent group cdn-sync >/dev/null 2>&1; then
        groupadd -g 1099 cdn-sync
    fi
    if ! id -u cdn-sync >/dev/null 2>&1; then
        useradd -u 1099 -g 1099 -m -s /bin/bash -d /home/cdn-sync cdn-sync
    fi
    install -d -m 0700 -o cdn-sync -g cdn-sync /home/cdn-sync/.ssh
    [ -f /home/cdn-sync/.ssh/authorized_keys ] || \
        install -m 0600 -o cdn-sync -g cdn-sync /dev/null /home/cdn-sync/.ssh/authorized_keys
    install -d -m 0750 -o cdn-sync -g cdn-sync /var/lib/cdn
fi

log "done. role=${ROLE}"
echo
echo "Next steps:"
case "$ROLE" in
    origin) echo "  → docker/cdn-node/DEPLOY.md §6 (build, scp, docker load)" ;;
    edge)   echo "  → docker/cdn-edge/DEPLOY.md §3+ (paste origin pubkey into ~cdn-sync/.ssh/authorized_keys, load image, run)" ;;
    cms)    echo "  → docker/cms-control-mt/DEPLOY.md §6" ;;
    auth)   echo "  → docker/auth/DEPLOY.md (à créer — voir conversation pour le shape)" ;;
esac
