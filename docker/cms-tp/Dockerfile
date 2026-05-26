# CMS tenant-provisioner — dev image only. Mounts the CMS as a conforming TP
# (createCmsProvider) + the issuer-kit metadoc/JWKS. Per-tenant CMS data in
# the shared Mongo; logs in-memory; no OKMS, no KEK.

FROM debian:bookworm-slim

ARG BUN_VERSION=1.3.6

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl unzip ca-certificates procps \
 && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o /tmp/bun.zip \
 && unzip -q /tmp/bun.zip -d /tmp \
 && mv /tmp/bun-linux-x64/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun.zip /tmp/bun-linux-x64 \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -r dp \
 && useradd -r -g dp -d /home/dp -s /usr/sbin/nologin -m dp

# Workspace build at image-build time. Same pattern as the example-tp image.
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY official-tenant-provisioners ./official-tenant-provisioners
COPY build.ts ./
RUN bun install && bun run build

WORKDIR /app
COPY docker/cms-tp/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/cms-tp/server.ts /app/server.ts

COPY docker/cms-tp/entrypoint.sh /usr/local/bin/cms-tp-entrypoint.sh
RUN chmod +x /usr/local/bin/cms-tp-entrypoint.sh

# Default; override via `PORT` env (compose pins to 4002 to avoid colliding
# with the hub (3000), example-tp (4000), addresses-tp (4001) on host).
EXPOSE 3000 4002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1

ENTRYPOINT ["/usr/local/bin/cms-tp-entrypoint.sh"]
