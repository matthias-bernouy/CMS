# `bernouy/cdn-edge` — public-serving node of a CDN cluster.
#
# Headless on purpose: nginx + sshd. NO lego, NO app, NO DB. The cert
# for ${PUBLIC_DOMAIN} (and per-alias certs) are minted by the origin
# via lego HTTP-01 — validation challenges hit any edge, get
# proxy_pass'd back to origin which serves the file. Issued certs are
# pushed to every edge via lsyncd. inotify-tools watches the cert dir
# and reloads nginx whenever a new cert lands.
#
# Build:
#   docker build \
#       -f docker/cdn-edge/Dockerfile \
#       -t bernouy/cdn-edge:0.2.0 \
#       docker/cdn-edge

FROM debian:bookworm-slim

# 1. System deps. nginx with brotli for matching the origin's
#    Cache-Control + pre-compressed sibling behaviour. openssh-server so
#    the origin can rsync into the volume. inotify-tools for the
#    cert-reload watcher.
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static \
        openssh-server rsync inotify-tools logrotate \
        ca-certificates curl gettext-base sudo procps \
 && rm -rf /var/lib/apt/lists/*

# 2. Dedicated SSH user the origin connects as. Lives at /home/cdn-sync,
#    has write access to /var/lib/cdn (the rsync target). nginx user
#    (`www-data`) joins the same group so it can read the synced blobs.
RUN groupadd -r cdn-sync \
 && useradd  -m -s /bin/bash -d /home/cdn-sync -g cdn-sync cdn-sync \
 && usermod  -a -G cdn-sync www-data \
 && install  -d -m 0700 -o cdn-sync -g cdn-sync /home/cdn-sync/.ssh \
 && install  -m 0600 -o cdn-sync -g cdn-sync /dev/null /home/cdn-sync/.ssh/authorized_keys

# 3. sshd hardening: no password auth, no root, only the `cdn-sync` user.
#    The host keys are persisted on the volume so a container restart
#    doesn't invalidate the origin's known_hosts entry.
RUN sed -i \
        -e 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' \
        -e 's/^#*PermitRootLogin.*/PermitRootLogin no/' \
        -e 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' \
        -e 's|^#*HostKey /etc/ssh/|HostKey /var/lib/cdn/sshd/|' \
        /etc/ssh/sshd_config \
 && echo "AllowUsers cdn-sync" >> /etc/ssh/sshd_config \
 && rm -f /etc/ssh/ssh_host_*

# 4. nginx skeleton (rendered at boot using ${PUBLIC_DOMAIN} + ${ORIGIN_HOST} + ${EDGE_ID}).
COPY bucketServing.conf  /etc/nginx/conf.d/cdn/bucketServing.conf
COPY nginx.conf.template /etc/nginx/conf.d/cdn/nginx.conf.template
RUN echo "include /etc/nginx/conf.d/cdn/nginx.conf;" > /etc/nginx/conf.d/cdn-include.conf \
 && rm -f /etc/nginx/sites-enabled/default

# 4b. logrotate config — hourly rotation of the JSON access log, gzip,
#     keep 168 files (7 days). Runs from the entrypoint's hourly loop.
COPY logrotate.conf /etc/logrotate.d/cdn-edge-access
RUN chmod 0644 /etc/logrotate.d/cdn-edge-access

# 5. Sudoers — the cert-reload watcher (running as cdn-sync) needs to
#    `nginx -s reload` whenever certs / configs change. Restricted to
#    that single command, no shell escape.
RUN echo "cdn-sync ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload" > /etc/sudoers.d/cdn-sync \
 && chmod 0440 /etc/sudoers.d/cdn-sync

# 6. Entrypoint + cert-reload watcher.
COPY entrypoint.sh         /usr/local/bin/cdn-edge-entrypoint.sh
COPY cert-reload-watcher.sh /usr/local/bin/cert-reload-watcher.sh
RUN chmod +x /usr/local/bin/cdn-edge-entrypoint.sh \
             /usr/local/bin/cert-reload-watcher.sh

VOLUME ["/var/lib/cdn"]
EXPOSE 22 80 443

# Healthcheck — nginx must accept on :80 (which serves the redirect /
# ACME proxy). 200/301/302/404 all count as healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1/ | grep -E '^(200|301|302|404)$' || exit 1

ENTRYPOINT ["/usr/local/bin/cdn-edge-entrypoint.sh"]
