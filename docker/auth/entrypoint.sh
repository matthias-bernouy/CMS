#!/bin/bash
# auth (Keycloak) entrypoint:
#   1. Volume layout — /var/lib/auth/lego{,/webroot}.
#   2. Render nginx.conf from template using ${MAIN_DOMAIN}.
#   3. Provision cert via lego HTTP-01 standalone (root) on first boot.
#   4. Start nginx + Keycloak (kc.sh start, HTTP on 127.0.0.1:8080).
#   5. Daily lego renew loop (webroot mode through nginx).
#
# All env vars below come from the OKMS bundle `auth/config` via
# okms-fetch (chained as the docker ENTRYPOINT).

set -e

: "${MAIN_DOMAIN:?MAIN_DOMAIN is required (e.g. auth.bernouy.com)}"
: "${LEGO_EMAIL:?LEGO_EMAIL is required}"
: "${KC_DB_URL_HOST:?KC_DB_URL_HOST is required (e.g. auth-postgres on the docker network)}"
: "${KC_DB_URL_DATABASE:?KC_DB_URL_DATABASE is required (e.g. keycloak)}"
: "${KC_DB_USERNAME:?KC_DB_USERNAME is required}"
: "${KC_DB_PASSWORD:?KC_DB_PASSWORD is required}"
: "${KEYCLOAK_ADMIN:?KEYCLOAK_ADMIN is required (initial bootstrap admin)}"
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"

DATA=/var/lib/auth
NGINX_CONF=/etc/nginx/conf.d/auth/nginx.conf

LEGO_SERVER_OPT=""
if [ -n "${LEGO_SERVER:-}" ]; then
    LEGO_SERVER_OPT="--server ${LEGO_SERVER}"
    echo "[auth] LEGO_SERVER override: ${LEGO_SERVER}"
fi

mkdir -p "$DATA/lego/certificates" "$DATA/lego/accounts" \
         "$DATA/lego/webroot/.well-known/acme-challenge"
chown -R keycloak:keycloak "$DATA/lego"

echo "[auth] Rendering nginx config for MAIN_DOMAIN=${MAIN_DOMAIN}…"
envsubst '${MAIN_DOMAIN}' < "${NGINX_CONF}.template" > "${NGINX_CONF}"

CERT="$DATA/lego/certificates/${MAIN_DOMAIN}.crt"
if [ ! -f "${CERT}" ]; then
    echo "[auth] Provisioning ${MAIN_DOMAIN} via lego (HTTP-01 standalone, as root)…"
    lego ${LEGO_SERVER_OPT} --accept-tos --email "${LEGO_EMAIL}" --domains "${MAIN_DOMAIN}" --path "$DATA/lego" --http run
    chown -R keycloak:keycloak "$DATA/lego"
else
    echo "[auth] Cert already present, skipping lego."
fi

nginx -t

echo "[auth] Starting nginx + Keycloak…"
nginx -g 'daemon off;' &
NGINX_PID=$!

# Keycloak runtime config. nginx terminates TLS, so KC speaks plain HTTP
# on loopback. KC_PROXY_HEADERS=xforwarded preserves the client's scheme.
# KC 26 hostname v2 is now the default: KC_HOSTNAME must be the full public
# URL (scheme included) when behind a TLS-terminating reverse proxy, not a
# bare hostname.
export KC_DB=postgres
export KC_HTTP_ENABLED=true
export KC_HTTP_HOST=127.0.0.1
export KC_HTTP_PORT=8080
export KC_HOSTNAME="https://${MAIN_DOMAIN}"
export KC_HOSTNAME_STRICT=true
export KC_PROXY_HEADERS=xforwarded

su -s /bin/bash keycloak -c "/opt/keycloak/bin/kc.sh start --optimized" &
KC_PID=$!

RENEW_PID=
(
    while true; do
        sleep 86400
        echo "[auth] daily lego renew check…"
        su -s /bin/bash keycloak -c "lego ${LEGO_SERVER_OPT} --accept-tos --email '${LEGO_EMAIL}' --domains '${MAIN_DOMAIN}' --path '$DATA/lego' --http --http.webroot '$DATA/lego/webroot' renew --renew-hook 'sudo /usr/sbin/nginx -s reload'" \
            || echo "[auth] renew failed (will retry in 24h)"
    done
) &
RENEW_PID=$!

cleanup() {
    echo "[auth] Caught signal, shutting down…"
    kill -TERM $NGINX_PID $KC_PID $RENEW_PID 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[auth] Child exited with ${EXIT}, tearing down the rest…"
kill -TERM $NGINX_PID $KC_PID $RENEW_PID 2>/dev/null || true
wait
exit "${EXIT}"
