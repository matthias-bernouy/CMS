#!/bin/bash
# cdn-edge entrypoint:
#   1. Volume layout (/var/lib/cdn/{buckets,lego,nginx-generated,sshd}).
#   2. Install AUTHORIZED_ORIGIN_PUBKEY into ~cdn-sync/.ssh/authorized_keys
#      (one-shot on first boot).
#   3. Generate persistent sshd host keys.
#   4. Render nginx config with ${PUBLIC_DOMAIN} + ${ORIGIN_HOST}.
#   5. Wait for the ${PUBLIC_DOMAIN} cert to be lsynced from the origin.
#      The origin mints it via HTTP-01 webroot — validation challenges
#      hit any edge and get proxy_pass'd back. We can't start nginx on
#      :443 without the cert, so we block here until lsyncd delivers it.
#   6. Start sshd + nginx + cert-reload-watcher.

set -e

: "${PUBLIC_DOMAIN:?PUBLIC_DOMAIN is required (e.g. cdn.example.com — the host edges round-robin on)}"
: "${ORIGIN_HOST:?ORIGIN_HOST is required (e.g. cdn-origin.example.com — used to proxy ACME)}"
: "${EDGE_ID:?EDGE_ID is required (must match the id registered in the origin admin UI, e.g. edge-fr-1)}"

DATA=/var/lib/cdn
NGINX_CONF=/etc/nginx/conf.d/cdn/nginx.conf

# 1. Volume layout. `nginx-generated/` is empty-touched so nginx -t
#    passes before the first lsyncd push. `access-logs/` holds the
#    JSON-Lines access log + rotated archives — the origin pulls these
#    via SSH+rsync.
mkdir -p "$DATA/buckets" \
         "$DATA/lego/certificates" \
         "$DATA/nginx-generated" \
         "$DATA/access-logs" \
         "$DATA/sshd"
touch    "$DATA/nginx-generated/cacheControls.conf" \
         "$DATA/nginx-generated/notFoundPaths.conf" \
         "$DATA/nginx-generated/aliases.conf" \
         "$DATA/nginx-generated/aliasesServers.conf" \
         "$DATA/access-logs/access.log"
chown -R cdn-sync:cdn-sync "$DATA/buckets" "$DATA/lego" "$DATA/nginx-generated" "$DATA/access-logs"
# Volume root must be writable by cdn-sync so lsyncd-from-origin can
# `chmod` / `chown` it without errors on every cycle.
chown cdn-sync:cdn-sync     "$DATA"
chmod 0750                 "$DATA/buckets"

# 2. AUTHORIZED_ORIGIN_PUBKEY — required on FIRST boot (env var). Persists
#    on the volume; subsequent boots are a no-op.
AUTHORIZED_FILE=/home/cdn-sync/.ssh/authorized_keys
if [ ! -s "${AUTHORIZED_FILE}" ]; then
    if [ -n "${AUTHORIZED_ORIGIN_PUBKEY:-}" ]; then
        echo "[edge] Installing AUTHORIZED_ORIGIN_PUBKEY into ${AUTHORIZED_FILE}"
        printf "%s\n" "${AUTHORIZED_ORIGIN_PUBKEY}" >> "${AUTHORIZED_FILE}"
        chown cdn-sync:cdn-sync "${AUTHORIZED_FILE}"
        chmod 0600              "${AUTHORIZED_FILE}"
    else
        echo "[edge] WARN: ${AUTHORIZED_FILE} is empty AND AUTHORIZED_ORIGIN_PUBKEY is unset."
        echo "        sshd will still start, but the origin cannot authenticate."
    fi
fi

# 3. sshd host keys (persisted on the volume).
chmod 0700 "$DATA/sshd"
if [ ! -f "$DATA/sshd/ssh_host_ed25519_key" ]; then
    echo "[edge] Generating sshd host keys (first boot)…"
    ssh-keygen -q -t rsa     -b 4096 -N '' -f "$DATA/sshd/ssh_host_rsa_key"
    ssh-keygen -q -t ecdsa   -b 384  -N '' -f "$DATA/sshd/ssh_host_ecdsa_key"
    ssh-keygen -q -t ed25519         -N '' -f "$DATA/sshd/ssh_host_ed25519_key"
fi
chmod 0600 "$DATA/sshd"/ssh_host_*_key
chmod 0644 "$DATA/sshd"/ssh_host_*_key.pub

# 4. Render nginx config.
echo "[edge] Rendering nginx config (PUBLIC_DOMAIN=${PUBLIC_DOMAIN}, ORIGIN_HOST=${ORIGIN_HOST}, EDGE_ID=${EDGE_ID})…"
envsubst '${PUBLIC_DOMAIN} ${ORIGIN_HOST} ${EDGE_ID}' < "${NGINX_CONF}.template" > "${NGINX_CONF}"

# 5. Bootstrap chicken-and-egg: the origin can only mint
#    ${PUBLIC_DOMAIN}'s cert if at least one edge is online to proxy
#    the ACME challenge back. So we start sshd + the port-80-only nginx
#    server BEFORE waiting for the cert, then wait for the cert, then
#    reload nginx with the full :443 config.
#
#    Trick: nginx config has both a port-80 server and a port-443
#    server (for ${PUBLIC_DOMAIN}). The :443 server's `ssl_certificate`
#    points at the lsynced path. Without the cert, nginx -t fails. We
#    swap in a temporary port-80-only config first, then once the cert
#    exists we swap back and reload.

# sshd needs /run/sshd for privilege separation; debian-slim doesn't ship it.
mkdir -p /run/sshd && chmod 0755 /run/sshd
/usr/sbin/sshd -D -e &
SSHD_PID=$!

# Temporary nginx config: only the port-80 catch-all (which proxy_passes
# ACME challenges back to origin and 301-redirects everything else).
TMP_NGINX_CONF=/etc/nginx/conf.d/cdn/nginx.conf.bootstrap
cat > "${TMP_NGINX_CONF}" <<EOF_BOOTSTRAP
server {
    listen 80 default_server;
    server_name _;
    location ^~ /.well-known/acme-challenge/ {
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_pass         http://${ORIGIN_HOST};
    }
    location / {
        return 503 "cdn-edge: waiting for cert\\n";
    }
}
EOF_BOOTSTRAP

if [ ! -f "$DATA/lego/certificates/${PUBLIC_DOMAIN}.crt" ]; then
    echo "[edge] Cert ${PUBLIC_DOMAIN}.crt missing — starting nginx in bootstrap mode (port 80 only) so origin's lego can validate via this edge."
    cp "${TMP_NGINX_CONF}" "${NGINX_CONF}"
    nginx -t
    nginx -g 'daemon off;' &
    NGINX_PID=$!

    # Wait for the cert. The origin is responsible for minting it (or
    # retrying daily). On a single-edge bootstrap, this typically lands
    # within ~20s of this edge being reachable.
    WAIT_MAX="${WAIT_FOR_CERT_SECONDS:-1800}"
    elapsed=0
    while [ ! -f "$DATA/lego/certificates/${PUBLIC_DOMAIN}.crt" ]; do
        if [ "${elapsed}" -ge "${WAIT_MAX}" ]; then
            echo "[edge] FATAL: ${PUBLIC_DOMAIN}.crt still missing after ${WAIT_MAX}s." 1>&2
            echo "        Origin must lsync it (check origin's lsyncd.log + lego output)." 1>&2
            kill -TERM $NGINX_PID $SSHD_PID 2>/dev/null || true
            exit 1
        fi
        if [ $(( elapsed % 30 )) -eq 0 ]; then
            echo "[edge] Waiting for ${PUBLIC_DOMAIN}.crt (lsynced from origin)… ${elapsed}s/${WAIT_MAX}s"
        fi
        sleep 5
        elapsed=$(( elapsed + 5 ))
    done
    echo "[edge] ${PUBLIC_DOMAIN}.crt landed — swapping to full nginx config."

    # Restore the full template-rendered config and reload.
    envsubst '${PUBLIC_DOMAIN} ${ORIGIN_HOST} ${EDGE_ID}' < "${NGINX_CONF}.template" > "${NGINX_CONF}"
    nginx -t
    nginx -s reload
else
    echo "[edge] ${PUBLIC_DOMAIN}.crt already present, starting nginx with full config."
    nginx -t
    nginx -g 'daemon off;' &
    NGINX_PID=$!
fi

# 6. Cert-reload watcher (covers both ${PUBLIC_DOMAIN} renewals and
#    per-alias cert lifecycle, both pushed by origin's lsyncd).
su -s /bin/bash cdn-sync -c "/usr/local/bin/cert-reload-watcher.sh" &
WATCHER_PID=$!

# 7. Hourly logrotate loop. logrotate's `hourly` directive doesn't
#    self-trigger — it just gates rotation logic to "once per hour";
#    something has to invoke logrotate. We do it from a sleep loop
#    rather than installing cron (one less moving part in the image).
(
    while true; do
        sleep 3600
        /usr/sbin/logrotate /etc/logrotate.d/cdn-edge-access \
            || echo "[edge] logrotate failed (will retry in 1h)"
    done
) &
LOGROTATE_PID=$!

cleanup() {
    echo "[edge] Caught signal, shutting down…"
    kill -TERM $SSHD_PID $NGINX_PID $WATCHER_PID $LOGROTATE_PID 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[edge] Child exited with ${EXIT}, tearing down the rest…"
kill -TERM $SSHD_PID $NGINX_PID $WATCHER_PID $LOGROTATE_PID 2>/dev/null || true
wait
exit "${EXIT}"
