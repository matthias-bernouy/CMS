# Multi-tenant CMS Control. Wires `MtControlCms`. External MongoDB.
# TLS embedded (lego HTTP-01) — single host, single domain.

FROM debian:bookworm-slim

ARG LEGO_VERSION=4.27.0
ARG BUN_VERSION=1.3.6
ARG TARGETARCH=amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx gnupg curl unzip jq ca-certificates lsb-release sudo gettext-base procps \
 && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o /tmp/bun.zip \
 && unzip -q /tmp/bun.zip -d /tmp \
 && mv /tmp/bun-linux-x64/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun.zip /tmp/bun-linux-x64 \
 && curl -fsSL "https://github.com/go-acme/lego/releases/download/v${LEGO_VERSION}/lego_v${LEGO_VERSION}_linux_${TARGETARCH}.tar.gz" \
        | tar -xz -C /usr/local/bin lego \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -r cms \
 && useradd -r -g cms -d /home/cms -s /usr/sbin/nologin -m cms

WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY build.ts ./
RUN bun install && bun run build

WORKDIR /app
COPY docker/cms-control-mt/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/cms-control-mt/server.ts /app/server.ts

# `ControlCms` instances served by tenants need write access to the cms
# bundle's static folder for the (legacy) appendFile path that v0.2.x has
# removed; chown is kept for safety on older lockfiles.
RUN chown -R cms:cms /socle/packages/cms/src/control/static/assets

COPY docker/cms-control-mt/nginx.conf.template /etc/nginx/conf.d/cms/nginx.conf.template
RUN mkdir -p /etc/nginx/conf.d/cms \
 && echo "include /etc/nginx/conf.d/cms/nginx.conf;" > /etc/nginx/conf.d/cms-include.conf \
 && rm -f /etc/nginx/sites-enabled/default

RUN echo "cms ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload" > /etc/sudoers.d/cms \
 && chmod 0440 /etc/sudoers.d/cms

# Shared OKMS bootstrap wrapper (fetches the config bundle at boot and
# exec's into the service entrypoint with env populated).
COPY docker/_shared/okms-fetch.sh /usr/local/bin/okms-fetch
RUN chmod +x /usr/local/bin/okms-fetch

COPY docker/cms-control-mt/entrypoint.sh /usr/local/bin/cms-entrypoint.sh
RUN chmod +x /usr/local/bin/cms-entrypoint.sh

VOLUME ["/var/lib/cms"]
EXPOSE 80 443

# Healthcheck — liveness probe (the superadmin surface is gone; provisioning
# is hub-driven). Returns 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:3000/health || exit 1

# Boot chain: okms-fetch (mTLS pull from OVHcloud Secret Manager) →
# cms-entrypoint (existing service orchestration). All env vars consumed
# by entrypoint.sh + server.ts come from the OKMS bundle, except the
# four OKMS_* bootstrap vars which come from the host's bootstrap.env.
ENTRYPOINT ["/usr/local/bin/okms-fetch", "/usr/local/bin/cms-entrypoint.sh"]
