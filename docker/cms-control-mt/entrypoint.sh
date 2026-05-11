#!/bin/bash
# mt-cms-control entrypoint:
#   1. Volume layout — /var/lib/cms/lego{,/webroot}.
#   2. Render nginx.conf from template using ${MAIN_DOMAIN}.
#   3. Provision cert via lego HTTP-01 standalone (root) on first boot.
#   4. nginx -t, then start nginx + bun. On either dying, kill the rest.
#   5. Daily lego renew loop (webroot mode through nginx).

set -e

: "${MAIN_DOMAIN:?MAIN_DOMAIN is required (e.g. cms.example.com)}"
: "${LEGO_EMAIL:?LEGO_EMAIL is required}"
: "${MONGO_URL:?MONGO_URL is required}"
: "${SUPERADMIN_KEYCLOAK_ISSUER:?SUPERADMIN_KEYCLOAK_ISSUER is required}"
: "${SUPERADMIN_KEYCLOAK_CLIENT_ID:?SUPERADMIN_KEYCLOAK_CLIENT_ID is required}"
: "${SUPERADMIN_KEYCLOAK_CLIENT_SECRET:?SUPERADMIN_KEYCLOAK_CLIENT_SECRET is required}"
: "${SUPERADMIN_KEYCLOAK_SESSION_SECRET:?SUPERADMIN_KEYCLOAK_SESSION_SECRET is required (>=32 random chars)}"

DATA=/var/lib/cms
NGINX_CONF=/etc/nginx/conf.d/cms/nginx.conf

LEGO_SERVER_OPT=""
if [ -n "${LEGO_SERVER:-}" ]; then
    LEGO_SERVER_OPT="--server ${LEGO_SERVER}"
    echo "[mt-cms] LEGO_SERVER override: ${LEGO_SERVER}"
fi

mkdir -p "$DATA/lego/certificates" "$DATA/lego/accounts" \
         "$DATA/lego/webroot/.well-known/acme-challenge"
chown -R cms:cms "$DATA/lego"

echo "[mt-cms] Rendering nginx config for MAIN_DOMAIN=${MAIN_DOMAIN}…"
envsubst '${MAIN_DOMAIN}' < "${NGINX_CONF}.template" > "${NGINX_CONF}"

CERT="$DATA/lego/certificates/${MAIN_DOMAIN}.crt"
if [ ! -f "${CERT}" ]; then
    echo "[mt-cms] Provisioning ${MAIN_DOMAIN} via lego (HTTP-01 standalone, as root)…"
    lego ${LEGO_SERVER_OPT} --accept-tos --email "${LEGO_EMAIL}" --domains "${MAIN_DOMAIN}" --path "$DATA/lego" --http run
    chown -R cms:cms "$DATA/lego"
else
    echo "[mt-cms] Cert already present, skipping lego."
fi

nginx -t

# OKMS cert/key for the bun app's KekProvider. `/etc/okms/*` is bind-
# mounted root:root with 0400 perms (enforced by okms-fetch) so the
# unprivileged `cms` user can't read it directly. Copy into a tmpfs
# location it can read, preserving tight perms.
mkdir -p /run/cms/okms
cp "${OKMS_CERT_PATH:-/etc/okms/client.crt}" /run/cms/okms/client.crt
cp "${OKMS_KEY_PATH:-/etc/okms/client.key}"  /run/cms/okms/client.key
chown -R cms:cms /run/cms/okms
chmod 0444 /run/cms/okms/client.crt
chmod 0400 /run/cms/okms/client.key
export OKMS_CERT_PATH=/run/cms/okms/client.crt
export OKMS_KEY_PATH=/run/cms/okms/client.key

echo "[mt-cms] Starting nginx + bun…"
nginx -g 'daemon off;' &
NGINX_PID=$!

su -s /bin/bash cms -c "bun run /app/server.ts" &
APP_PID=$!

RENEW_PID=
(
    while true; do
        sleep 86400
        echo "[mt-cms] daily lego renew check…"
        su -s /bin/bash cms -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --path '$DATA/lego' --http --http.webroot '$DATA/lego/webroot' renew --renew-hook 'sudo /usr/sbin/nginx -s reload'" \
            || echo "[mt-cms] renew failed (will retry in 24h)"
    done
) &
RENEW_PID=$!

cleanup() {
    echo "[mt-cms] Caught signal, shutting down…"
    kill -TERM $NGINX_PID $APP_PID $RENEW_PID 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[mt-cms] Child exited with ${EXIT}, tearing down the rest…"
kill -TERM $NGINX_PID $APP_PID $RENEW_PID 2>/dev/null || true
wait
exit "${EXIT}"
