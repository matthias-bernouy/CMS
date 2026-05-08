# Hub API. Single Bun process exposing the orchestration REST API.
# No nginx / no TLS in this image — the hub is private (only reachable
# by the central UI / ops scripts). Front it with whatever reverse proxy
# the deployer provides.

FROM debian:bookworm-slim

ARG BUN_VERSION=1.3.6

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl unzip ca-certificates \
 && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o /tmp/bun.zip \
 && unzip -q /tmp/bun.zip -d /tmp \
 && mv /tmp/bun-linux-x64/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun.zip /tmp/bun-linux-x64 \
 && rm -rf /var/lib/apt/lists/*

# Build the workspace once at image build time.
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY build.ts ./
RUN bun install && bun run build

# App layout — symlink to the workspace node_modules so server.ts can
# import @bernouy/hub-api + dependencies without its own install step.
WORKDIR /app
COPY docker/hub-api/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/hub-api/server.ts /app/server.ts

EXPOSE 3000

# Public liveness probe — does NOT cross the network to Keycloak/cms/cdn.
# For deeper validation use the gated `/api/preflight` endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:3000/health || exit 1

CMD ["bun", "run", "/app/server.ts"]
