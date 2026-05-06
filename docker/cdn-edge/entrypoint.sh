#!/bin/bash
# cdn-edge entrypoint:
#   1. Ensure /var/lib/cdn/{buckets,lego,nginx-generated,sshd} exist with
#      the right ownership.
#   2. Generate persistent sshd host keys on first boot (under the volume,
#      so origin's known_hosts stays valid across container restarts).
#   3. Render nginx.conf from the template using ${MAIN_DOMAIN} +
#      ${ORIGIN_HOST}.
#   4. Wait until the wildcard cert is present (lsynced from origin) —
#      nginx won't start without the file. Default timeout 10 min.
#   5. Start sshd + nginx + cert-reload-watcher. On any of them dying,
#      kill the rest.

set -e

: "${MAIN_DOMAIN:?MAIN_DOMAIN is required (e.g. cdn.example.com — same value as the origin)}"
: "${ORIGIN_HOST:?ORIGIN_HOST is required (e.g. cdn-origin.example.com — used to proxy ACME HTTP-01)}"

# AUTHORIZED_ORIGIN_PUBKEY is REQUIRED on first boot: the operator passes
# the origin's id_ed25519.pub line via env var (or a bind-mount) and we
# install it into ~cdn-sync/.ssh/authorized_keys. Subsequent boots are a
# no-op (the file is on the volume).
AUTHORIZED_FILE=/home/cdn-sync/.ssh/authorized_keys
if [ ! -s "${AUTHORIZED_FILE}" ]; then
    if [ -n "${AUTHORIZED_ORIGIN_PUBKEY:-}" ]; then
        echo "[edge] Installing AUTHORIZED_ORIGIN_PUBKEY into ${AUTHORIZED_FILE}"
        printf "%s\n" "${AUTHORIZED_ORIGIN_PUBKEY}" >> "${AUTHORIZED_FILE}"
        chown cdn-sync:cdn-sync "${AUTHORIZED_FILE}"
        chmod 0600              "${AUTHORIZED_FILE}"
    else
        echo "[edge] WARN: ${AUTHORIZED_FILE} is empty AND AUTHORIZED_ORIGIN_PUBKEY is unset."
        echo "        sshd will start but origin cannot authenticate. Either set the env var"
        echo "        OR drop the pubkey directly into the volume before next boot."
    fi
fi

DATA=/var/lib/cdn
NGINX_CONF=/etc/nginx/conf.d/cdn/nginx.conf

# 1. Volume layout. `nginx-generated/` exists as touched empty files so
#    nginx -t doesn't fail before the first lsyncd push.
mkdir -p "$DATA/buckets" \
         "$DATA/lego/certificates" \
         "$DATA/nginx-generated" \
         "$DATA/sshd"
touch    "$DATA/nginx-generated/cacheControls.conf" \
         "$DATA/nginx-generated/notFoundPaths.conf" \
         "$DATA/nginx-generated/aliases.conf" \
         "$DATA/nginx-generated/aliasesServers.conf"
chown -R cdn-sync:cdn-sync "$DATA/buckets" "$DATA/lego" "$DATA/nginx-generated"
chmod 0750                 "$DATA/buckets"

# 2. sshd host keys (persisted on the volume so origin's known_hosts
#    stays valid across container restarts).
chmod 0700 "$DATA/sshd"
if [ ! -f "$DATA/sshd/ssh_host_ed25519_key" ]; then
    echo "[edge] Generating sshd host keys (first boot)…"
    ssh-keygen -q -t rsa     -b 4096 -N '' -f "$DATA/sshd/ssh_host_rsa_key"
    ssh-keygen -q -t ecdsa   -b 384  -N '' -f "$DATA/sshd/ssh_host_ecdsa_key"
    ssh-keygen -q -t ed25519         -N '' -f "$DATA/sshd/ssh_host_ed25519_key"
fi
chmod 0600 "$DATA/sshd"/ssh_host_*_key
chmod 0644 "$DATA/sshd"/ssh_host_*_key.pub

# 3. Render nginx config.
echo "[edge] Rendering nginx config (MAIN_DOMAIN=${MAIN_DOMAIN}, ORIGIN_HOST=${ORIGIN_HOST})…"
envsubst '${MAIN_DOMAIN} ${ORIGIN_HOST}' < "${NGINX_CONF}.template" > "${NGINX_CONF}"

# 4. Wait for the wildcard cert. The origin issues + lsyncs it; on a
#    fresh edge, this can take a couple of minutes after `+ Add edge` in
#    the origin UI (lsyncd init pass).
WILDCARD_CRT="$DATA/lego/certificates/${MAIN_DOMAIN}.crt"
WAIT_MAX="${WAIT_FOR_CERT_SECONDS:-600}"
elapsed=0
while [ ! -f "${WILDCARD_CRT}" ]; do
    if [ "${elapsed}" -ge "${WAIT_MAX}" ]; then
        echo "[edge] FATAL: ${WILDCARD_CRT} still missing after ${WAIT_MAX}s." 1>&2
        echo "        Origin must lsync it (check origin's edge probe + lsyncd.log)." 1>&2
        exit 1
    fi
    if [ $(( elapsed % 30 )) -eq 0 ]; then
        echo "[edge] Waiting for ${WILDCARD_CRT} (lsynced from origin)… ${elapsed}s/${WAIT_MAX}s"
    fi
    sleep 5
    elapsed=$(( elapsed + 5 ))
done
echo "[edge] ${WILDCARD_CRT} present, continuing."

nginx -t

echo "[edge] Starting sshd + nginx + cert-reload-watcher…"
/usr/sbin/sshd -D -e &
SSHD_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

# 5. Cert-reload watcher — inotify on /var/lib/cdn/{lego/certificates,
#    nginx-generated} debounced 5s, calls `sudo nginx -s reload` on
#    changes. Started as cdn-sync (matches the sudoers rule).
su -s /bin/bash cdn-sync -c "/usr/local/bin/cert-reload-watcher.sh" &
WATCHER_PID=$!

cleanup() {
    echo "[edge] Caught signal, shutting down…"
    kill -TERM $SSHD_PID $NGINX_PID $WATCHER_PID 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[edge] Child exited with ${EXIT}, tearing down the rest…"
kill -TERM $SSHD_PID $NGINX_PID $WATCHER_PID 2>/dev/null || true
wait
exit "${EXIT}"
