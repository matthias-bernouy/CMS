#!/bin/bash
# cdn-keycloak entrypoint (external MongoDB):
#   1. Ensure /var/lib/cdn/{buckets,lego} exist + ownership.
#   2. Render nginx.conf from the template using ${MAIN_DOMAIN}.
#   3. Provision the wildcard cert via lego (DNS-01) on first boot if missing.
#   4. nginx -t, then start nginx + bun. On either dying, kill the rest.

set -e

: "${MAIN_DOMAIN:?MAIN_DOMAIN is required (e.g. cdn.example.com)}"
: "${LEGO_EMAIL:?LEGO_EMAIL is required}"
: "${MONGO_URL:?MONGO_URL is required (e.g. mongodb+srv://user:pass@cluster.mongodb.net/)}"
: "${KEYCLOAK_ISSUER:?KEYCLOAK_ISSUER is required}"
: "${KEYCLOAK_CLIENT_ID:?KEYCLOAK_CLIENT_ID is required}"
: "${KEYCLOAK_CLIENT_SECRET:?KEYCLOAK_CLIENT_SECRET is required}"
: "${KEYCLOAK_SESSION_SECRET:?KEYCLOAK_SESSION_SECRET is required (>=32 random chars)}"

DATA=/var/lib/cdn
NGINX_CONF=/etc/nginx/conf.d/cdn/nginx.conf

# Optional ACME server override — set to e.g.
# `https://acme-staging-v02.api.letsencrypt.org/directory` to test the lego
# pipeline without burning the Let's Encrypt prod quota. Drop the env var
# (or unset) to fall back to lego's default (Let's Encrypt prod). Affects
# both the first-boot provisioning and the daily renew loop.
LEGO_SERVER_OPT=""
if [ -n "${LEGO_SERVER:-}" ]; then
    LEGO_SERVER_OPT="--server ${LEGO_SERVER}"
    echo "[cdn] LEGO_SERVER override: ${LEGO_SERVER}"
fi

# 1. Volume layout — first boot may have an empty volume.
#    `lego/webroot` is the HTTP-01 challenge dir written to by lego (alias
#    cert issuance) and read by nginx on :80.
mkdir -p "$DATA/buckets" \
         "$DATA/lego/certificates" "$DATA/lego/accounts" \
         "$DATA/lego/webroot/.well-known/acme-challenge"
chown -R cdn:cdn "$DATA/buckets" "$DATA/lego"
chmod 0750       "$DATA/buckets"

# 2. Render nginx config.
echo "[cdn] Rendering nginx config for MAIN_DOMAIN=${MAIN_DOMAIN}…"
envsubst '${MAIN_DOMAIN}' < "${NGINX_CONF}.template" > "${NGINX_CONF}"

# 3. Wildcard cert (DNS-01 — only path that issues wildcards).
WILDCARD_CRT="$DATA/lego/certificates/${MAIN_DOMAIN}.crt"
if [ ! -f "${WILDCARD_CRT}" ]; then
    : "${LEGO_DNS_PROVIDER:?LEGO_DNS_PROVIDER is required for the first-boot wildcard provisioning. Or pre-mount an existing cert at ${WILDCARD_CRT}.}"
    echo "[cdn] Provisioning *.${MAIN_DOMAIN} via lego (--dns ${LEGO_DNS_PROVIDER})…"
    su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --domains '*.${MAIN_DOMAIN}' --path '$DATA/lego' --dns '${LEGO_DNS_PROVIDER}' run"
else
    echo "[cdn] Wildcard cert already present, skipping lego."
fi

nginx -t

echo "[cdn] Starting nginx + bun…"
nginx -g 'daemon off;' &
NGINX_PID=$!

su -s /bin/bash cdn -c "bun run /app/server.ts" &
APP_PID=$!

# 5. Daily wildcard renew loop (skipped if DNS provider isn't configured —
#    e.g. operator brought their own cert). lego renew is a fast no-op when
#    the cert isn't close to expiry, so polling daily is cheap.
RENEW_PID=
if [ -n "${LEGO_DNS_PROVIDER}" ]; then
    (
        while true; do
            sleep 86400
            echo "[cdn] daily lego renew check (wildcard)…"
            su -s /bin/bash cdn -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --domains '*.${MAIN_DOMAIN}' --path '$DATA/lego' --dns '${LEGO_DNS_PROVIDER}' renew --renew-hook 'sudo /usr/sbin/nginx -s reload'" \
                || echo "[cdn] wildcard renew failed (will retry in 24h)"
        done
    ) &
    RENEW_PID=$!
    echo "[cdn] wildcard renew loop started (pid ${RENEW_PID})"
fi

# 6. Daily backup loop. Runs at BACKUP_TIME UTC (default 03:00) every 24h.
#    Set BACKUP_DISABLED=true to opt out. Off-site sync is configured by
#    BACKUP_RCLONE_REMOTE + a bind-mounted ${BACKUP_RCLONE_CONFIG_PATH:-/etc/cdn/rclone.conf}.
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
        echo "[cdn] first backup in ${first_sleep}s (BACKUP_TIME=${BACKUP_TIME} UTC)"
        sleep "${first_sleep}"
        while true; do
            /usr/local/bin/cdn-backup.sh \
                || echo "[cdn] backup failed (will retry in 24h)"
            sleep 86400
        done
    ) &
    BACKUP_PID=$!
    echo "[cdn] daily backup loop started (pid ${BACKUP_PID})"
fi

cleanup() {
    echo "[cdn] Caught signal, shutting down…"
    kill -TERM $NGINX_PID $APP_PID $RENEW_PID $BACKUP_PID 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[cdn] Child exited with ${EXIT}, tearing down the rest…"
kill -TERM $NGINX_PID $APP_PID $RENEW_PID $BACKUP_PID 2>/dev/null || true
wait
exit "${EXIT}"
