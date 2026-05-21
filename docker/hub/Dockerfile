# Hub — single Bun process serving /admin/* (mountHubUi), /api/* (mountHubApi),
# and the hub-issuer publication endpoints. NO nginx, NO lego here — TLS
# termination + ACME live in the sibling `bernouy/nginx-proxy` container.
# This image speaks plain HTTP on :3000 over the docker network.

FROM debian:bookworm-slim

ARG BUN_VERSION=1.3.6

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl unzip jq ca-certificates procps \
 && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o /tmp/bun.zip \
 && unzip -q /tmp/bun.zip -d /tmp \
 && mv /tmp/bun-linux-x64/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun.zip /tmp/bun-linux-x64 \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -r hub \
 && useradd -r -g hub -d /home/hub -s /usr/sbin/nologin -m hub

# Workspace build at image-build time. Both `packages/` and
# `official-data-providers/` are needed since hub-api consumes
# `@bernouy/issuer-kit` + `@bernouy/data-provider-contract` at runtime.
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY official-data-providers ./official-data-providers
COPY build.ts ./
RUN bun install && bun run build

WORKDIR /app
COPY docker/hub/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/hub/server.ts /app/server.ts

# Shared OKMS bootstrap wrapper.
COPY docker/_shared/okms-fetch.sh /usr/local/bin/okms-fetch
RUN chmod +x /usr/local/bin/okms-fetch

COPY docker/hub/entrypoint.sh /usr/local/bin/hub-entrypoint.sh
RUN chmod +x /usr/local/bin/hub-entrypoint.sh

# /var/lib/hub holds the issuer-kit signing keys (keys.json). MUST be a
# persistent volume in prod — losing it means the hub regen its signing
# keys at next boot, breaking every data-provider's trust until they
# refetch the JWKS.
VOLUME ["/var/lib/hub"]
EXPOSE 3000

# /health is exposed by mountHubApi at the runner root.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:3000/health || exit 1

# Boot chain: okms-fetch (mTLS pull from OVHcloud Secret Manager) →
# hub-entrypoint (env validation + OKMS cert copy + bun). All env vars
# consumed come from the OKMS bundle, except the OKMS_* bootstrap vars
# from the host's bootstrap.env.
ENTRYPOINT ["/usr/local/bin/okms-fetch", "/usr/local/bin/hub-entrypoint.sh"]
