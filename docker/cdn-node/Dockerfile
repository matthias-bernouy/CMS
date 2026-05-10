# All-in-one origin image for a CDN cluster. Wraps the cdn-keycloak
# feature set with edge management on top:
#   - Mongo lives external (Atlas / self-hosted) — see MONGO_URL.
#   - lsyncd + ssh + rsync ship in the image; the origin pushes
#     `/var/lib/cdn/buckets` to every registered edge over SSH.
#   - The admin UI gets a `/admin/origin/*` surface (edges, monitoring).
#
# The origin is OUT of the public DNS round-robin: it serves only the
# admin/upload host (MAIN_DOMAIN), never the bucket sub-domains. Edges
# (run from a separate image, future) are what the public hits for
# `*.MAIN_DOMAIN`.
#
# Build:
#   docker buildx build --network=host \
#       -f docker/cdn-node/Dockerfile \
#       -t bernouy/cdn-origin:0.2.0 .

FROM debian:bookworm-slim

ARG LEGO_VERSION=4.27.0
ARG BUN_VERSION=1.3.6
ARG TARGETARCH=amd64

# 1. System deps + Bun + lego + rclone + mongodump (external Mongo) +
#    lsyncd + openssh-client + rsync (edge sync).
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static \
        gnupg curl unzip jq ca-certificates lsb-release sudo gettext-base procps \
        lsyncd openssh-client rsync libcap2-bin \
 && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o /tmp/bun.zip \
 && unzip -q /tmp/bun.zip -d /tmp \
 && mv /tmp/bun-linux-x64/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun.zip /tmp/bun-linux-x64 \
 && curl -fsSL "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-100.13.0.deb" -o /tmp/mongotools.deb \
 && apt-get install -y --no-install-recommends /tmp/mongotools.deb \
 && rm -f /tmp/mongotools.deb \
 && curl -fsSL "https://github.com/go-acme/lego/releases/download/v${LEGO_VERSION}/lego_v${LEGO_VERSION}_linux_${TARGETARCH}.tar.gz" \
        | tar -xz -C /usr/local/bin lego \
 && setcap cap_net_bind_service=+ep /usr/local/bin/lego \
 && curl -fsSL "https://downloads.rclone.org/rclone-current-linux-${TARGETARCH}.zip" -o /tmp/rclone.zip \
 && unzip -q /tmp/rclone.zip -d /tmp \
 && mv /tmp/rclone-*-linux-${TARGETARCH}/rclone /usr/local/bin/rclone \
 && chmod +x /usr/local/bin/rclone \
 && rm -rf /tmp/rclone.zip /tmp/rclone-*-linux-${TARGETARCH} \
 && rm -rf /var/lib/apt/lists/*

# 2. Dedicated app user; nginx user joins its group so it can read blobs.
RUN groupadd -r cdn \
 && useradd -r -g cdn -d /home/cdn -s /bin/bash -m cdn \
 && usermod -a -G cdn www-data

# 3. Build the workspace once at image build time.
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY build.ts ./
RUN bun install && bun run build

# 4. App layout — symlink to the workspace node_modules so server.ts can
#    import @bernouy/{core,cdn,cdn-origin,runner-bun,auth-keycloak} +
#    mongodb without its own install step.
WORKDIR /app
COPY docker/cdn-node/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/cdn-node/server.ts /app/server.ts

# 5. Runtime layout. The generated nginx fragments live UNDER the volume
#    (`/var/lib/cdn/nginx-generated/`) so lsyncd can push them to every
#    edge alongside the blobs. The entrypoint creates them on first boot
#    if missing — empty files are valid nginx includes.
RUN mkdir -p /etc/lsyncd \
 && chown -R cdn:cdn /etc/lsyncd

# 6. Nginx skeleton — admin host only (no public *.MAIN_DOMAIN block —
#    the origin is private). The HTTP-01 challenge dir on :80 still works
#    so edges can `proxy_pass` ACME challenges back here.
COPY docker/cdn-node/bucketServing.conf  /etc/nginx/conf.d/cdn/bucketServing.conf
COPY docker/cdn-node/nginx.conf.template /etc/nginx/conf.d/cdn/nginx.conf.template
RUN echo "include /etc/nginx/conf.d/cdn/nginx.conf;" > /etc/nginx/conf.d/cdn-include.conf \
 && rm -f /etc/nginx/sites-enabled/default

# 7. Sudoers — cdn user can reload nginx (and only that).
RUN echo "cdn ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload" > /etc/sudoers.d/cdn \
 && chmod 0440 /etc/sudoers.d/cdn

# 8. Shared OKMS bootstrap wrapper (fetches the config bundle at boot
#    and exec's into the service entrypoint with env populated).
COPY docker/_shared/okms-fetch.sh /usr/local/bin/okms-fetch
RUN chmod +x /usr/local/bin/okms-fetch

# 9. Entrypoint + lsyncd supervisor + backup script.
COPY docker/cdn-node/entrypoint.sh        /usr/local/bin/cdn-entrypoint.sh
COPY docker/cdn-node/lsyncd-supervisor.sh /usr/local/bin/lsyncd-supervisor.sh
COPY docker/cdn-node/lsyncd-reload.sh     /usr/local/bin/lsyncd-reload.sh
COPY docker/cdn-node/cdn-backup.sh        /usr/local/bin/cdn-backup.sh
RUN chmod +x /usr/local/bin/cdn-entrypoint.sh \
             /usr/local/bin/lsyncd-supervisor.sh \
             /usr/local/bin/lsyncd-reload.sh \
             /usr/local/bin/cdn-backup.sh

VOLUME ["/var/lib/cdn"]
EXPOSE 80 443

# Healthcheck — hits the admin loopback port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:3000/admin/buckets || exit 1

# Boot chain: okms-fetch (mTLS pull from OVHcloud Secret Manager) →
# cdn-entrypoint (existing service orchestration). All env vars consumed
# by entrypoint.sh + server.ts come from the OKMS bundle, except the
# four OKMS_* bootstrap vars which come from the host's bootstrap.env.
ENTRYPOINT ["/usr/local/bin/okms-fetch", "/usr/local/bin/cdn-entrypoint.sh"]
