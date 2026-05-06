#!/bin/bash
# cdn-origin entrypoint:
#   1. Ensure /var/lib/cdn/{buckets,lego,ssh,lsyncd} exist + ownership.
#   2. Generate the origin SSH keypair on first boot (used by lsyncd +
#      probes to reach edges).
#   3. Render nginx.conf from the template using ${MAIN_DOMAIN}.
#   4. Provision the cert for ${MAIN_DOMAIN} via lego (DNS-01) on first
#      boot if missing. Note: origin is private — no wildcard needed.
#   5. nginx -t, then start nginx + bun + lsyncd-supervisor + cert renew
#      loop + backup loop. On any of them dying, kill the rest.

set -e

: "${MAIN_DOMAIN:?MAIN_DOMAIN is required (e.g. cdn-origin.example.com)}"
: "${PUBLIC_DOMAIN:?PUBLIC_DOMAIN is required (e.g. cdn.example.com — the host edges round-robin on)}"
: "${LEGO_EMAIL:?LEGO_EMAIL is required}"
: "${MONGO_URL:?MONGO_URL is required (e.g. mongodb+srv://user:pass@cluster.mongodb.net/)}"
: "${KEYCLOAK_ISSUER:?KEYCLOAK_ISSUER is required}"
: "${KEYCLOAK_CLIENT_ID:?KEYCLOAK_CLIENT_ID is required}"
: "${KEYCLOAK_CLIENT_SECRET:?KEYCLOAK_CLIENT_SECRET is required}"
: "${KEYCLOAK_SESSION_SECRET:?KEYCLOAK_SESSION_SECRET is required (>=32 random chars)}"

DATA=/var/lib/cdn
NGINX_CONF=/etc/nginx/conf.d/cdn/nginx.conf

LEGO_SERVER_OPT=""
if [ -n "${LEGO_SERVER:-}" ]; then
    LEGO_SERVER_OPT="--server ${LEGO_SERVER}"
    echo "[origin] LEGO_SERVER override: ${LEGO_SERVER}"
fi

# 1. Volume layout. `nginx-generated/` lives here (not /etc/nginx/) so
#    lsyncd can push it to every edge — that's where the dynamic alias
#    + cacheControl + bucket-notfound fragments end up. `access-logs/`
#    is where the in-process log puller drops each edge's rotated
#    archives (one subdir per edge id).
mkdir -p "$DATA/buckets" \
         "$DATA/lego/certificates" "$DATA/lego/accounts" \
         "$DATA/lego/webroot/.well-known/acme-challenge" \
         "$DATA/nginx-generated" \
         "$DATA/access-logs" \
         "$DATA/ssh" \
         "$DATA/lsyncd"
touch    "$DATA/nginx-generated/cacheControls.conf" \
         "$DATA/nginx-generated/notFoundPaths.conf" \
         "$DATA/nginx-generated/aliases.conf" \
         "$DATA/nginx-generated/aliasesServers.conf"
chown -R cdn:cdn "$DATA/buckets" "$DATA/lego" "$DATA/nginx-generated" "$DATA/access-logs" "$DATA/ssh" "$DATA/lsyncd"
chmod 0750       "$DATA/buckets"
chmod 0700       "$DATA/ssh"

# 2. SSH keypair (first boot only). Used by lsyncd to push to edges and
#    by the probe to read remote disk usage.
SSH_KEY="${SSH_KEY_PATH:-$DATA/ssh/id_ed25519}"
if [ ! -f "$SSH_KEY" ]; then
    echo "[origin] Generating SSH keypair at $SSH_KEY (first boot)…"
    su -s /bin/bash cdn -c "ssh-keygen -t ed25519 -N '' -C 'cdn-origin@${MAIN_DOMAIN}' -f '$SSH_KEY'"
    echo "[origin] Public key:"
    cat "${SSH_KEY}.pub"
    echo "[origin] Add this line to ~/.ssh/authorized_keys on every edge server."
fi
chmod 0600 "$SSH_KEY" "${SSH_KEY}.pub" 2>/dev/null || true

# 3. Render nginx config.
echo "[origin] Rendering nginx config for MAIN_DOMAIN=${MAIN_DOMAIN}…"
envsubst '${MAIN_DOMAIN}' < "${NGINX_CONF}.template" > "${NGINX_CONF}"

# 4. Provision cert for MAIN_DOMAIN. Origin is single-host (NOT a
#    wildcard). Two modes depending on LEGO_DNS_PROVIDER:
#    - DNS-01 if set: works without public reachability, no port binding.
#    - HTTP-01 otherwise: lego's built-in server binds :80 (the
#      `setcap cap_net_bind_service=+ep` baked into the image lets
#      lego do this without root). Requires DNS A record AND TCP/80
#      open to the public internet BEFORE first boot.
ADMIN_CRT="$DATA/lego/certificates/${MAIN_DOMAIN}.crt"
if [ ! -f "${ADMIN_CRT}" ]; then
    if [ -n "${LEGO_DNS_PROVIDER:-}" ]; then
        echo "[origin] Provisioning ${MAIN_DOMAIN} via lego DNS-01 (--dns ${LEGO_DNS_PROVIDER})…"
        su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --path '$DATA/lego' --dns '${LEGO_DNS_PROVIDER}' run"
    else
        echo "[origin] Provisioning ${MAIN_DOMAIN} via lego HTTP-01 (built-in :80)…"
        echo "[origin]   DNS A record for ${MAIN_DOMAIN} MUST resolve to this server,"
        echo "[origin]   and TCP/80 inbound from the public internet MUST be open."
        su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --path '$DATA/lego' --http run"
    fi
else
    echo "[origin] ${MAIN_DOMAIN} cert already present, skipping lego."
fi

nginx -t

echo "[origin] Starting nginx + bun + lsyncd-supervisor…"
nginx -g 'daemon off;' &
NGINX_PID=$!

su -s /bin/bash cdn -c "bun run /app/server.ts" &
APP_PID=$!

# 5. lsyncd supervisor — respawns lsyncd whenever it exits (manual reload
#    via /usr/local/bin/lsyncd-reload.sh signals it to die, supervisor
#    picks it back up with the new config).
LSYNCD_PID=
if [ "${LSYNCD_DISABLED:-false}" != "true" ]; then
    su -s /bin/bash cdn -c "/usr/local/bin/lsyncd-supervisor.sh" &
    LSYNCD_PID=$!
    echo "[origin] lsyncd supervisor started (pid ${LSYNCD_PID})"
fi

# 6a. PUBLIC_DOMAIN cert: minted AFTER nginx + lsyncd are up, because
#     HTTP-01 validation goes through the edges (which proxy_pass back
#     here). On a fresh deployment with no edges yet, this fails — we
#     warn and let the renew loop retry. Once the cert lands, lsyncd
#     pushes it to all edges; their inotify watcher reloads nginx.
PUBLIC_CRT="$DATA/lego/certificates/${PUBLIC_DOMAIN}.crt"
if [ ! -f "${PUBLIC_CRT}" ]; then
    echo "[origin] Provisioning ${PUBLIC_DOMAIN} via lego HTTP-01 (webroot, via edge proxy_back)…"
    su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${PUBLIC_DOMAIN}' --path '$DATA/lego' --http --http.webroot '$DATA/lego/webroot' run" \
        || echo "[origin] WARN: ${PUBLIC_DOMAIN} cert issuance failed (no edge online or DNS not propagated). Renew loop will retry in 24h."
else
    echo "[origin] ${PUBLIC_DOMAIN} cert already present, skipping lego."
fi

# 6b. Daily renew loop covers BOTH MAIN_DOMAIN and PUBLIC_DOMAIN. Mode
#     for MAIN_DOMAIN follows the issuance mode (DNS-01 if provider,
#     HTTP-01 webroot otherwise). PUBLIC_DOMAIN is always HTTP-01
#     webroot validated through any edge.
RENEW_PID=
(
    while true; do
        sleep 86400
        echo "[origin] daily lego renew check (${MAIN_DOMAIN})…"
        if [ -n "${LEGO_DNS_PROVIDER:-}" ]; then
            su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --path '$DATA/lego' --dns '${LEGO_DNS_PROVIDER}' renew --renew-hook 'sudo /usr/sbin/nginx -s reload'" \
                || echo "[origin] admin cert renew failed (will retry in 24h)"
        else
            su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --path '$DATA/lego' --http --http.webroot '$DATA/lego/webroot' renew --renew-hook 'sudo /usr/sbin/nginx -s reload'" \
                || echo "[origin] admin cert renew failed (will retry in 24h)"
        fi
        # PUBLIC_DOMAIN: try renew if we have a cert, otherwise try
        # initial issuance (covers the first-edge case where boot-time
        # mint failed because no edge was up yet).
        echo "[origin] daily lego check (${PUBLIC_DOMAIN})…"
        if [ -f "$DATA/lego/certificates/${PUBLIC_DOMAIN}.crt" ]; then
            su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${PUBLIC_DOMAIN}' --path '$DATA/lego' --http --http.webroot '$DATA/lego/webroot' renew" \
                || echo "[origin] ${PUBLIC_DOMAIN} renew failed (will retry in 24h)"
        else
            su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${PUBLIC_DOMAIN}' --path '$DATA/lego' --http --http.webroot '$DATA/lego/webroot' run" \
                || echo "[origin] ${PUBLIC_DOMAIN} initial issuance still failing (no edge online?)"
        fi
    done
) &
RENEW_PID=$!
echo "[origin] cert renew loop started (pid ${RENEW_PID})"

# 7. Daily backup loop.
BACKUP_PID=
if [ "${BACKUP_DISABLED:-false}" != "true" ]; then
    (
        BACKUP_TIME="${BACKUP_TIME:-03:00}"
        target=$(date -u -d "today ${BACKUP_TIME}" +%s 2>/dev/null \
                 || date -u -d "today 03:00" +%s)
        now=$(date -u +%s)
        if [ "${target}" -le "${now}" ]; then
            target=$(date -u -d "tomorrow ${BACKUP_TIME}" +%s 2>/dev/null \
                     || date -u -d "tomorrow 03:00" +%s)
        fi
        first_sleep=$(( target - now ))
        echo "[origin] first backup in ${first_sleep}s (BACKUP_TIME=${BACKUP_TIME} UTC)"
        sleep "${first_sleep}"
        while true; do
            /usr/local/bin/cdn-backup.sh \
                || echo "[origin] backup failed (will retry in 24h)"
            sleep 86400
        done
    ) &
    BACKUP_PID=$!
    echo "[origin] daily backup loop started (pid ${BACKUP_PID})"
fi

cleanup() {
    echo "[origin] Caught signal, shutting down…"
    kill -TERM $NGINX_PID $APP_PID $LSYNCD_PID $RENEW_PID $BACKUP_PID 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[origin] Child exited with ${EXIT}, tearing down the rest…"
kill -TERM $NGINX_PID $APP_PID $LSYNCD_PID $RENEW_PID $BACKUP_PID 2>/dev/null || true
wait
exit "${EXIT}"
