#!/bin/bash
# cms-control entrypoint:
#   1. Volume layout — /var/lib/cms/lego{,/webroot}.
#   2. Render nginx.conf from template using ${MAIN_DOMAIN}.
#   3. Provision wildcard cert via lego DNS-01 on first boot if missing.
#   4. nginx -t, then start nginx + bun. On either dying, kill the rest.
#   5. Daily lego renew loop.

set -e

: "${MAIN_DOMAIN:?MAIN_DOMAIN is required (e.g. cms.example.com)}"
: "${LEGO_EMAIL:?LEGO_EMAIL is required}"
: "${MONGO_URL:?MONGO_URL is required}"
: "${KEYCLOAK_ISSUER:?KEYCLOAK_ISSUER is required}"
: "${KEYCLOAK_CLIENT_ID:?KEYCLOAK_CLIENT_ID is required}"
: "${KEYCLOAK_CLIENT_SECRET:?KEYCLOAK_CLIENT_SECRET is required}"
: "${KEYCLOAK_SESSION_SECRET:?KEYCLOAK_SESSION_SECRET is required (>=32 random chars)}"
: "${CDN_URL:?CDN_URL is required (e.g. https://cdn.example.com)}"
: "${CDN_BUCKET_CREDENTIAL:?CDN_BUCKET_CREDENTIAL is required (server-side bucket bearer token)}"

DATA=/var/lib/cms
NGINX_CONF=/etc/nginx/conf.d/cms/nginx.conf

LEGO_SERVER_OPT=""
if [ -n "${LEGO_SERVER:-}" ]; then
    LEGO_SERVER_OPT="--server ${LEGO_SERVER}"
    echo "[cms] LEGO_SERVER override: ${LEGO_SERVER}"
fi

# 1. Volume layout.
mkdir -p "$DATA/lego/certificates" "$DATA/lego/accounts" \
         "$DATA/lego/webroot/.well-known/acme-challenge"
chown -R cms:cms "$DATA/lego"

# 2. Render nginx config.
echo "[cms] Rendering nginx config for MAIN_DOMAIN=${MAIN_DOMAIN}…"
envsubst '${MAIN_DOMAIN}' < "${NGINX_CONF}.template" > "${NGINX_CONF}"

# 3. Cert via lego HTTP-01.
#    First boot: lego standalone — lego binds port 80 itself. Run as root
#    (privileged port), then `chown` the cert files back to the cms user.
#    Renewals (later loop): webroot mode via the running nginx, runs as cms.
CERT="$DATA/lego/certificates/${MAIN_DOMAIN}.crt"
if [ ! -f "${CERT}" ]; then
    echo "[cms] Provisioning ${MAIN_DOMAIN} via lego (HTTP-01 standalone, as root)…"
    lego ${LEGO_SERVER_OPT} --accept-tos --email "${LEGO_EMAIL}" --domains "${MAIN_DOMAIN}" --path "$DATA/lego" --http run
    chown -R cms:cms "$DATA/lego"
else
    echo "[cms] Cert already present, skipping lego."
fi

nginx -t

echo "[cms] Starting nginx + bun…"
nginx -g 'daemon off;' &
NGINX_PID=$!

su -s /bin/bash cms -c "bun run /app/server.ts" &
APP_PID=$!

# 4. Daily renew loop (HTTP-01 via webroot — nginx serves the challenge).
RENEW_PID=
(
    while true; do
        sleep 86400
        echo "[cms] daily lego renew check…"
        su -s /bin/bash cms -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --path '$DATA/lego' --http --http.webroot '$DATA/lego/webroot' renew --renew-hook 'sudo /usr/sbin/nginx -s reload'" \
            || echo "[cms] renew failed (will retry in 24h)"
    done
) &
RENEW_PID=$!

cleanup() {
    echo "[cms] Caught signal, shutting down…"
    kill -TERM $NGINX_PID $APP_PID $RENEW_PID 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[cms] Child exited with ${EXIT}, tearing down the rest…"
kill -TERM $NGINX_PID $APP_PID $RENEW_PID 2>/dev/null || true
wait
exit "${EXIT}"
