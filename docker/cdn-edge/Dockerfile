# `bernouy/cdn-edge` — public-serving node of a CDN cluster.
#
# Headless on purpose: nginx only. NO sshd, NO lego, NO app, NO DB. The
# origin connects to the EDGE HOST's sshd (port 22, user `cdn-sync`
# pre-created by `docker/init-server.sh --role edge` with UID/GID 1099),
# rsyncs blobs/certs/fragments into `/var/lib/cdn` (bind-mounted into
# this container). The matching UID/GID 1099 inside the container means
# nginx (`www-data`, member of group `cdn-sync`) can read every file
# the host's cdn-sync just wrote — no chmod dance, no UID surprise.
#
# inotify-tools watches the cert dir for new certs landing via lsync,
# triggers `nginx -s reload`. jq + curl + envsubst (gettext-base) drive
# the secrets-pull pipeline (`fetch-secrets.sh` + `render-secrets.sh`)
# AND the OKMS bootstrap wrapper.
#
# Build (context = repo root, NOT docker/cdn-edge/, so the shared
# OKMS bootstrap script under docker/_shared/ is reachable):
#   docker buildx build \
#       -f docker/cdn-edge/Dockerfile \
#       -t bernouy/cdn-edge:0.2.0 .

FROM debian:bookworm-slim

# 1. System deps. nginx with brotli for matching the origin's
#    Cache-Control + pre-compressed sibling behaviour. inotify-tools for
#    the cert-reload watcher. jq + curl + envsubst for the secrets pipe.
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static \
        inotify-tools logrotate \
        ca-certificates curl gettext-base jq sudo procps \
 && rm -rf /var/lib/apt/lists/*

# 2. cdn-sync user/group, UID/GID 1099 — MUST match the host's cdn-sync
#    created by `init-server.sh --role edge`. The user owns no home dir
#    in the image (sshd is host-side now); the group exists so `www-data`
#    can read blobs lsynced from origin via the bind-mounted volume.
RUN groupadd  -g 1099 cdn-sync \
 && useradd   -u 1099 -g 1099 -M -s /usr/sbin/nologin cdn-sync \
 && usermod   -a -G cdn-sync www-data

# 4. nginx skeleton (rendered at boot using ${PUBLIC_DOMAIN} + ${ORIGIN_HOST} + ${EDGE_ID}).
COPY docker/cdn-edge/bucketServing.conf  /etc/nginx/conf.d/cdn/bucketServing.conf
COPY docker/cdn-edge/nginx.conf.template /etc/nginx/conf.d/cdn/nginx.conf.template
RUN echo "include /etc/nginx/conf.d/cdn/nginx.conf;" > /etc/nginx/conf.d/cdn-include.conf \
 && rm -f /etc/nginx/sites-enabled/default

# 4b. logrotate config — hourly rotation of the JSON access log, gzip,
#     keep 168 files (7 days). Runs from the entrypoint's hourly loop.
COPY docker/cdn-edge/logrotate.conf /etc/logrotate.d/cdn-edge-access
RUN chmod 0644 /etc/logrotate.d/cdn-edge-access

# 5. Sudoers — the cert-reload watcher (running as cdn-sync) needs to
#    `nginx -s reload` AND `nginx -t` whenever certs / configs change.
#    `nginx -t` in unprivileged mode fails to open /run/nginx.pid
#    (created by the master nginx running as root) — sudo lets the
#    watcher validate the config before each reload. Restricted to the
#    two specific argv combinations, no shell escape.
RUN echo "cdn-sync ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload, /usr/sbin/nginx -t" > /etc/sudoers.d/cdn-sync \
 && chmod 0440 /etc/sudoers.d/cdn-sync

# 6. Shared OKMS bootstrap wrapper (fetches the config bundle at boot
#    and exec's into the service entrypoint with env populated).
COPY docker/_shared/okms-fetch.sh /usr/local/bin/okms-fetch
RUN chmod +x /usr/local/bin/okms-fetch

# 7. Entrypoint + watchers + secrets pipeline.
COPY docker/cdn-edge/entrypoint.sh          /usr/local/bin/cdn-edge-entrypoint.sh
COPY docker/cdn-edge/cert-reload-watcher.sh /usr/local/bin/cert-reload-watcher.sh
COPY docker/cdn-edge/render-secrets.sh      /usr/local/bin/render-secrets.sh
COPY docker/cdn-edge/fetch-secrets.sh       /usr/local/bin/fetch-secrets.sh
RUN chmod +x /usr/local/bin/cdn-edge-entrypoint.sh \
             /usr/local/bin/cert-reload-watcher.sh \
             /usr/local/bin/render-secrets.sh \
             /usr/local/bin/fetch-secrets.sh

VOLUME ["/var/lib/cdn"]
EXPOSE 80 443

# Healthcheck — nginx must accept on :80 (which serves the redirect /
# ACME proxy). 200/301/302/404 all count as healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1/ | grep -E '^(200|301|302|404)$' || exit 1

# Boot chain: okms-fetch (mTLS pull from OVHcloud Secret Manager) →
# cdn-edge-entrypoint (existing service orchestration). All env vars
# consumed by entrypoint.sh come from the OKMS bundle, except the four
# OKMS_* bootstrap vars which come from the host's bootstrap.env.
ENTRYPOINT ["/usr/local/bin/okms-fetch", "/usr/local/bin/cdn-edge-entrypoint.sh"]
