# Example data-provider — dev image only. Mounts the SDK provider
# (planes 1/2/3 from base.md) + the issuer-kit metadoc/JWKS. In-memory
# everything: no persistent storage, no OKMS, no KEK.

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

# Workspace build at image-build time. Same pattern as the hub image.
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY official-data-providers ./official-data-providers
COPY build.ts ./
RUN bun install && bun run build

WORKDIR /app
COPY docker/example-dp/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/example-dp/server.ts /app/server.ts

COPY docker/example-dp/entrypoint.sh /usr/local/bin/example-dp-entrypoint.sh
RUN chmod +x /usr/local/bin/example-dp-entrypoint.sh

# Default; override via `PORT` env (compose pins to 4000 to avoid the
# hub's 3000 colliding on host when both are published).
EXPOSE 3000 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1

ENTRYPOINT ["/usr/local/bin/example-dp-entrypoint.sh"]
