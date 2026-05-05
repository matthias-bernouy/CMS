# All-in-one CDN image with MongoDB, Nginx, lego, Bun, and Keycloak auth wired.
# Build context MUST be the monorepo root:
#     docker build -f docker/cdn-keycloak/Dockerfile -t bernouy/cdn-keycloak:0.1.0 .
#
# Single mounted volume `/var/lib/cdn` carries mongo data + blobs + certs.

FROM debian:bookworm-slim

ARG LEGO_VERSION=4.27.0
ARG BUN_VERSION=1.3.6
ARG TARGETARCH=amd64

# 1. System deps + Bun + lego + rclone + mongodb-database-tools (mongodump
#    only — server is now external).
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static \
        gnupg curl unzip ca-certificates lsb-release sudo gettext-base procps \
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
 && curl -fsSL "https://downloads.rclone.org/rclone-current-linux-${TARGETARCH}.zip" -o /tmp/rclone.zip \
 && unzip -q /tmp/rclone.zip -d /tmp \
 && mv /tmp/rclone-*-linux-${TARGETARCH}/rclone /usr/local/bin/rclone \
 && chmod +x /usr/local/bin/rclone \
 && rm -rf /tmp/rclone.zip /tmp/rclone-*-linux-${TARGETARCH} \
 && rm -rf /var/lib/apt/lists/*

# 2. Dedicated app user; nginx user joins its group so it can read blobs.
RUN groupadd -r cdn \
 && useradd -r -g cdn -d /home/cdn -s /usr/sbin/nologin -m cdn \
 && usermod -a -G cdn www-data

# 4. Build the workspace once at image build time.
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY build.ts ./
RUN bun install && bun run build

# 4. App layout — symlink to the workspace node_modules so server.ts can
#    import @bernouy/{core,cdn,runner-bun,auth-keycloak} + mongodb without
#    its own install step.
WORKDIR /app
COPY docker/cdn-keycloak/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/cdn-keycloak/server.ts /app/server.ts

# 5. Runtime layout (the volume's contents are created on first boot).
RUN mkdir -p /etc/nginx/conf.d/cdn/generated \
 && touch /etc/nginx/conf.d/cdn/generated/cacheControls.conf \
          /etc/nginx/conf.d/cdn/generated/notFoundPaths.conf \
          /etc/nginx/conf.d/cdn/generated/aliases.conf \
          /etc/nginx/conf.d/cdn/generated/aliasesServers.conf \
 && chown -R cdn:cdn /etc/nginx/conf.d/cdn/generated

# 6. Nginx skeleton.
# Use the cdn-keycloak override (/var/lib/cdn/buckets) instead of the
# package default (/var/storage/buckets prod path).
COPY docker/cdn-keycloak/bucketServing.conf /etc/nginx/conf.d/cdn/bucketServing.conf
COPY docker/cdn-keycloak/nginx.conf.template /etc/nginx/conf.d/cdn/nginx.conf.template
RUN echo "include /etc/nginx/conf.d/cdn/nginx.conf;" > /etc/nginx/conf.d/cdn-include.conf \
 && rm -f /etc/nginx/sites-enabled/default

# 7. Sudoers — cdn user can reload nginx (and only that).
RUN echo "cdn ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload" > /etc/sudoers.d/cdn \
 && chmod 0440 /etc/sudoers.d/cdn

# 8. Entrypoint (wildcard provisioning → nginx + bun supervisor)
#    + backup script (mongodump via MONGO_URL + buckets tar + optional rclone).
COPY docker/cdn-keycloak/entrypoint.sh  /usr/local/bin/cdn-entrypoint.sh
COPY docker/cdn-keycloak/cdn-backup.sh  /usr/local/bin/cdn-backup.sh
RUN chmod +x /usr/local/bin/cdn-entrypoint.sh /usr/local/bin/cdn-backup.sh

VOLUME ["/var/lib/cdn"]
EXPOSE 80 443

# Healthcheck — hits the bun app via its loopback port. Returns 302 → /auth/login
# when healthy; -f flips non-2xx/3xx into a non-zero exit. start-period covers
# mongod fork + first-boot wildcard provisioning (DNS-01 can take a few min on
# slow providers — bump if your DNS provider is lazy).
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:3000/admin/buckets || exit 1

ENTRYPOINT ["/usr/local/bin/cdn-entrypoint.sh"]
