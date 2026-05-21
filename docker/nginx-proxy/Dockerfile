# Shared reverse proxy. nginx + lego for ACME (HTTP-01) + a small bash
# entrypoint that generates the nginx config from the `UPSTREAMS` env
# (populated from an OKMS bundle). Sits in front of every backend
# (hub:3000, cms:3000, auth:8080, …) on a shared docker network and is
# the only container exposing :80 / :443 on the host.

FROM debian:bookworm-slim

ARG LEGO_VERSION=4.27.0
ARG TARGETARCH=amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx curl ca-certificates jq procps \
 && curl -fsSL "https://github.com/go-acme/lego/releases/download/v${LEGO_VERSION}/lego_v${LEGO_VERSION}_linux_${TARGETARCH}.tar.gz" \
        | tar -xz -C /usr/local/bin lego \
 && rm -rf /var/lib/apt/lists/*

# nginx master needs root to bind :80 / :443 and to signal worker reloads;
# workers run as the default `www-data` user via nginx's own config.
RUN rm -f /etc/nginx/sites-enabled/default

# Shared OKMS bootstrap wrapper.
COPY docker/_shared/okms-fetch.sh /usr/local/bin/okms-fetch
RUN chmod +x /usr/local/bin/okms-fetch

COPY docker/nginx-proxy/entrypoint.sh /usr/local/bin/nginx-proxy-entrypoint.sh
RUN chmod +x /usr/local/bin/nginx-proxy-entrypoint.sh

# /var/lib/nginx-proxy holds the lego certs + webroot. Persistent volume
# in prod (lego avoids re-issuing on restart).
VOLUME ["/var/lib/nginx-proxy"]
EXPOSE 80 443

# nginx serves an internal `/__nginx_proxy_health` returning 200; gated
# to the loopback so external callers don't reach it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1/__nginx_proxy_health || exit 1

ENTRYPOINT ["/usr/local/bin/okms-fetch", "/usr/local/bin/nginx-proxy-entrypoint.sh"]
