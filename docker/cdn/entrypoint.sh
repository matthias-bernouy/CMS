#!/bin/bash
# @bernouy/cdn base image entrypoint.
#   1. Render nginx config from the template using ${MAIN_DOMAIN}.
#   2. Provision the wildcard cert via lego (DNS-01) on first boot if missing.
#   3. Validate the rendered nginx config.
#   4. Start nginx + the user's CMD (default `bun run /app/server.ts`),
#      forwarding signals; exit when either child dies.

set -e

: "${MAIN_DOMAIN:?MAIN_DOMAIN is required (e.g. cdn.example.com)}"
: "${LEGO_EMAIL:?LEGO_EMAIL is required (ACME account email)}"

NGINX_CONF=/etc/nginx/conf.d/cdn/nginx.conf

echo "[cdn] Rendering nginx config for MAIN_DOMAIN=${MAIN_DOMAIN}…"
envsubst '${MAIN_DOMAIN}' \
    < "${NGINX_CONF}.template" \
    > "${NGINX_CONF}"

# 2. Wildcard cert — only DNS-01 issues wildcards. Skipped if already present
#    (volume-mounted, or persisted from a previous run).
WILDCARD_CRT="/etc/lego/certificates/${MAIN_DOMAIN}.crt"
if [ ! -f "${WILDCARD_CRT}" ]; then
    : "${LEGO_DNS_PROVIDER:?LEGO_DNS_PROVIDER is required for the first-boot wildcard provisioning. Or mount an existing cert at ${WILDCARD_CRT}.}"
    echo "[cdn] Provisioning *.${MAIN_DOMAIN} via lego (--dns ${LEGO_DNS_PROVIDER})…"
    su-exec cdn:cdn env "PATH=$PATH" lego \
        --accept-tos \
        --email "${LEGO_EMAIL}" \
        --domains "${MAIN_DOMAIN}" \
        --domains "*.${MAIN_DOMAIN}" \
        --path /etc/lego \
        --dns "${LEGO_DNS_PROVIDER}" \
        run
else
    echo "[cdn] Wildcard cert already present at ${WILDCARD_CRT}, skipping lego."
fi

nginx -t

echo "[cdn] Starting nginx (foreground) + user CMD ($*)…"

nginx -g 'daemon off;' &
NGINX_PID=$!

su-exec cdn:cdn "$@" &
APP_PID=$!

cleanup() {
    echo "[cdn] Caught signal, shutting down…"
    kill -TERM "${NGINX_PID}" "${APP_PID}" 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[cdn] Child exited with ${EXIT}, tearing down the rest…"
kill -TERM "${NGINX_PID}" "${APP_PID}" 2>/dev/null || true
wait
exit "${EXIT}"
