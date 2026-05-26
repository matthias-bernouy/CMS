#!/usr/bin/env bash
# Generate the WireGuard mesh for the monitoring overlay network.
#
# Outputs one wg0.conf file per peer under ./out/. Each peer's
# [Interface] holds its private key + its assigned 10.10.0.X address, and
# carries [Peer] sections for every OTHER node in the mesh. No public-
# internet exposure of metrics endpoints — Prometheus scrapes via the
# wg0 interface.
#
# Run ONCE on the operator machine. Each generated wg0.conf must then be
# scp'd to /etc/wireguard/wg0.conf on the matching VPS, with 0600 perms.
# Re-running rotates ALL keys — only do that during planned maintenance.
#
# The peer endpoints (Endpoint = <public-ip>:51820) are filled in via the
# VPS_IP_* env vars below; export them before running or edit inline.

set -euo pipefail

cd "$(dirname "$0")"

# ── Public IPs of each VPS — required for the [Peer].Endpoint line.
: "${VPS_IP_MONITORING:?VPS_IP_MONITORING is required (public IP of the new monitoring VPS)}"
: "${VPS_IP_CMS:?VPS_IP_CMS is required (public IP of cms.bernouy.com)}"

LISTEN_PORT="${WG_LISTEN_PORT:-51820}"
OUT_DIR="${OUT_DIR:-./out}"
mkdir -p "${OUT_DIR}"
chmod 0700 "${OUT_DIR}"

if ! command -v wg >/dev/null 2>&1; then
    echo "FATAL: 'wg' tool missing. Install wireguard-tools (apt install wireguard-tools)." >&2
    exit 1
fi

NODES=("monitoring:10.10.0.1:${VPS_IP_MONITORING}"
       "cms:10.10.0.2:${VPS_IP_CMS}")

# 1. Generate one keypair per node.
declare -A PRIV PUB
for entry in "${NODES[@]}"; do
    name="${entry%%:*}"
    PRIV[$name]=$(wg genkey)
    PUB[$name]=$(printf "%s" "${PRIV[$name]}" | wg pubkey)
done

# 2. Emit one wg0.conf per node, listing every other node as a [Peer].
for entry in "${NODES[@]}"; do
    name="${entry%%:*}"
    addr="${entry#*:}"; addr="${addr%%:*}"
    out="${OUT_DIR}/${name}.wg0.conf"

    {
        echo "[Interface]"
        echo "PrivateKey = ${PRIV[$name]}"
        echo "Address    = ${addr}/24"
        echo "ListenPort = ${LISTEN_PORT}"
        echo
        for peer_entry in "${NODES[@]}"; do
            peer_name="${peer_entry%%:*}"
            [ "${peer_name}" = "${name}" ] && continue
            peer_addr="${peer_entry#*:}"; peer_addr="${peer_addr%%:*}"
            peer_endpoint="${peer_entry##*:}"
            echo "# ${peer_name}"
            echo "[Peer]"
            echo "PublicKey  = ${PUB[$peer_name]}"
            echo "AllowedIPs = ${peer_addr}/32"
            echo "Endpoint   = ${peer_endpoint}:${LISTEN_PORT}"
            echo "PersistentKeepalive = 25"
            echo
        done
    } > "${out}"
    chmod 0600 "${out}"
    echo "wrote ${out}  (peer pubkey: ${PUB[$name]})"
done

echo
echo "Next:"
echo "  for node in monitoring cms; do"
echo "    scp out/\${node}.wg0.conf ubuntu@<host>:/tmp/wg0.conf"
echo "    ssh ubuntu@<host> 'sudo install -m 0600 /tmp/wg0.conf /etc/wireguard/wg0.conf && \\"
echo "       sudo systemctl enable --now wg-quick@wg0'"
echo "  done"
echo
echo "Verify connectivity from monitoring VPS:"
echo "  ping -c2 10.10.0.2  # cms"
