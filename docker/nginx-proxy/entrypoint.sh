#!/bin/bash
# nginx-proxy entrypoint :
#   1. Validate env (populated by okms-fetch from the OKMS bundle).
#   2. Parse the UPSTREAMS map (CSV of `domain=host:port` triples).
#   3. /var/lib/nginx-proxy/{lego/certificates,lego/webroot} layout.
#   4. Provision certs for every domain via lego HTTP-01 on first boot.
#   5. Generate /etc/nginx/conf.d/proxy.conf with one server { } block
#      per upstream + the global ACME-challenge location.
#   6. Start nginx + daily lego renew loop.

set -e

: "${LEGO_EMAIL:?LEGO_EMAIL is required (ACME registration email)}"
: "${UPSTREAMS:?UPSTREAMS is required (CSV of <domain>=<host>:<port>, e.g. hub.bernouy.com=hub:3000,cms.bernouy.com=cms:3000)}"

DATA=/var/lib/nginx-proxy
CONF=/etc/nginx/conf.d/proxy.conf

LEGO_SERVER_OPT=""
if [ -n "${LEGO_SERVER:-}" ]; then
    LEGO_SERVER_OPT="--server ${LEGO_SERVER}"
    echo "[nginx-proxy] LEGO_SERVER override: ${LEGO_SERVER}"
fi

mkdir -p "$DATA/lego/certificates" "$DATA/lego/accounts" \
         "$DATA/lego/webroot/.well-known/acme-challenge"

# Parse the UPSTREAMS map into a bash associative array. Domain and target
# are interpolated into nginx config below — strict regex validation here
# is the trust boundary that prevents config injection from a malformed
# (or malicious) OKMS bundle.
declare -A UPSTREAM_OF
DOMAINS_LIST=""
DOMAIN_RE='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
TARGET_RE='^[a-z0-9]([a-z0-9.-]{0,253}[a-z0-9])?:[0-9]{1,5}$'
IFS=',' read -ra PAIRS <<< "${UPSTREAMS}"
for pair in "${PAIRS[@]}"; do
    pair="$(echo "$pair" | xargs)"   # trim whitespace
    [ -z "$pair" ] && continue
    domain="${pair%%=*}"
    target="${pair#*=}"
    if [ -z "$domain" ] || [ -z "$target" ] || [ "$domain" = "$pair" ]; then
        echo "[nginx-proxy] FATAL: malformed UPSTREAMS entry '$pair' (expected '<domain>=<host>:<port>')"
        exit 1
    fi
    if ! [[ "$domain" =~ $DOMAIN_RE ]]; then
        echo "[nginx-proxy] FATAL: invalid domain '$domain' (must match $DOMAIN_RE)"
        exit 1
    fi
    if ! [[ "$target" =~ $TARGET_RE ]]; then
        echo "[nginx-proxy] FATAL: invalid target '$target' for domain '$domain' (must match $TARGET_RE)"
        exit 1
    fi
    UPSTREAM_OF["$domain"]="$target"
    DOMAINS_LIST="${DOMAINS_LIST:+${DOMAINS_LIST},}${domain}"
done

if [ -z "$DOMAINS_LIST" ]; then
    echo "[nginx-proxy] FATAL: UPSTREAMS parsed to empty list."
    exit 1
fi
echo "[nginx-proxy] domains: ${DOMAINS_LIST}"

# 4. Provision certs (one lego invocation per domain — keeps a per-domain
#    account/cert layout; lego handles already-present case via its --renew).
for domain in "${!UPSTREAM_OF[@]}"; do
    CERT="$DATA/lego/certificates/${domain}.crt"
    if [ ! -f "${CERT}" ]; then
        echo "[nginx-proxy] Provisioning ${domain} via lego (HTTP-01 standalone)…"
        lego ${LEGO_SERVER_OPT} --accept-tos --email "${LEGO_EMAIL}" \
            --domains "${domain}" --path "$DATA/lego" --http run
    else
        echo "[nginx-proxy] Cert already present for ${domain}, skipping initial lego run."
    fi
done

# 5. Generate nginx config (one server-block pair per upstream + a global
#    catch-all on :80 that serves the ACME challenge and 301s the rest).
{
    cat <<'GLOBAL'
# Generated at boot by nginx-proxy entrypoint.

server {
    listen 80 default_server;
    server_name _;

    # ACME HTTP-01 challenge — served from a webroot lego writes into
    # during the daily renew loop. nginx serves it cleartext, fine.
    location ^~ /.well-known/acme-challenge/ {
        root /var/lib/nginx-proxy/lego/webroot;
        default_type "text/plain";
        try_files $uri =404;
    }

    # Internal healthcheck (loopback only). 200 if nginx is up.
    location = /__nginx_proxy_health {
        allow 127.0.0.1;
        deny all;
        return 200 "ok\n";
    }

    # Everything else → HTTPS.
    location / {
        return 301 https://$host$request_uri;
    }
}
GLOBAL

    for domain in "${!UPSTREAM_OF[@]}"; do
        target="${UPSTREAM_OF[$domain]}"
        # Replace dots with underscores for the upstream name (nginx
        # constraint).
        upstream_name="backend_${domain//./_}"
        cat <<UPSTREAM

upstream ${upstream_name} {
    server ${target};
    keepalive 16;
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    ssl_certificate     /var/lib/nginx-proxy/lego/certificates/${domain}.crt;
    ssl_certificate_key /var/lib/nginx-proxy/lego/certificates/${domain}.key;

    client_max_body_size 16m;

    location / {
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   X-Forwarded-Host  \$host;
        proxy_pass         http://${upstream_name};
    }
}
UPSTREAM
    done
} > "${CONF}"

nginx -t

echo "[nginx-proxy] Starting nginx…"
nginx -g 'daemon off;' &
NGINX_PID=$!

# Daily lego renew through nginx's webroot (zero-downtime — nginx stays
# up, lego writes the challenge file, nginx serves it).
RENEW_DOMAINS_OPT=""
for domain in "${!UPSTREAM_OF[@]}"; do
    RENEW_DOMAINS_OPT="${RENEW_DOMAINS_OPT} --domains ${domain}"
done
(
    while true; do
        sleep 86400
        echo "[nginx-proxy] daily lego renew check…"
        lego ${LEGO_SERVER_OPT} --accept-tos --email "${LEGO_EMAIL}" \
            ${RENEW_DOMAINS_OPT} \
            --path "$DATA/lego" --http --http.webroot "$DATA/lego/webroot" \
            renew --renew-hook 'nginx -s reload' \
            || echo "[nginx-proxy] renew failed (will retry in 24h)"
    done
) &
RENEW_PID=$!

cleanup() {
    echo "[nginx-proxy] Caught signal, shutting down…"
    kill -TERM $NGINX_PID $RENEW_PID 2>/dev/null || true
    wait
}
trap cleanup INT TERM

wait -n
EXIT=$?
echo "[nginx-proxy] Child exited with ${EXIT}, tearing down…"
kill -TERM $NGINX_PID $RENEW_PID 2>/dev/null || true
wait
exit "${EXIT}"
