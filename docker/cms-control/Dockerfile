# Admin/API layer of the CMS (no Delivery, single domain). External MongoDB.
# Build context MUST be the monorepo root:
#     docker build -f docker/cms-control/Dockerfile -t bernouy/cms-control:0.1.0 .

FROM debian:bookworm-slim

ARG LEGO_VERSION=4.27.0
ARG BUN_VERSION=1.3.6
ARG TARGETARCH=amd64

# 1. System deps + Bun + lego.
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx gnupg curl unzip ca-certificates lsb-release sudo gettext-base procps \
 && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o /tmp/bun.zip \
 && unzip -q /tmp/bun.zip -d /tmp \
 && mv /tmp/bun-linux-x64/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun.zip /tmp/bun-linux-x64 \
 && curl -fsSL "https://github.com/go-acme/lego/releases/download/v${LEGO_VERSION}/lego_v${LEGO_VERSION}_linux_${TARGETARCH}.tar.gz" \
        | tar -xz -C /usr/local/bin lego \
 && rm -rf /var/lib/apt/lists/*

# 2. Dedicated app user.
RUN groupadd -r cms \
 && useradd -r -g cms -d /home/cms -s /usr/sbin/nologin -m cms

# 3. Vendor @bernouy/webcomponents (sibling workspace package, not on npm).
COPY --from=webcomponents . /WebComponents/

# 4. Build the workspace once at image build time.
#    `prebuildControl` regenerates `control-components.js` cleanly — without
#    this, ControlCms's runtime `appendFile` of dev hydrations stays in the
#    source bundle and pollutes prod with `media.<dev>.local` references.
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
RUN bun install \
 && cd /socle/packages/cms && bun -e 'import("./src/control/prebuildControl").then(m => m.default()).catch(e => { console.error(e); process.exit(1); })' && cd /socle \
 && bunx tsc --build

# 5. App layout — symlink to workspace node_modules so server.ts can import
#    @bernouy/{core,cdn,cms,runner-bun,auth-keycloak} + mongodb directly.
WORKDIR /app
COPY docker/cms-control/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/cms-control/server.ts /app/server.ts

# 6. Make the cms package's mutable bundle paths writable by the cms user.
#    `ControlCms` appends the media hydration script to control-components.js
#    on every boot — needs write access.
RUN chown -R cms:cms /socle/packages/cms/src/control/static/assets

# 7. Nginx skeleton.
COPY docker/cms-control/nginx.conf.template /etc/nginx/conf.d/cms/nginx.conf.template
RUN mkdir -p /etc/nginx/conf.d/cms \
 && echo "include /etc/nginx/conf.d/cms/nginx.conf;" > /etc/nginx/conf.d/cms-include.conf \
 && rm -f /etc/nginx/sites-enabled/default

# 8. Sudoers — cms user can reload nginx (only).
RUN echo "cms ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload" > /etc/sudoers.d/cms \
 && chmod 0440 /etc/sudoers.d/cms

# 9. Entrypoint.
COPY docker/cms-control/entrypoint.sh /usr/local/bin/cms-entrypoint.sh
RUN chmod +x /usr/local/bin/cms-entrypoint.sh

VOLUME ["/var/lib/cms"]
EXPOSE 80 443

# Healthcheck on the bun app loopback. start-period covers the first-boot
# wildcard provisioning via lego DNS-01.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:3000/cms/admin/pages || exit 1

ENTRYPOINT ["/usr/local/bin/cms-entrypoint.sh"]
