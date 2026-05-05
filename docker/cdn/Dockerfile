# Base image for `@bernouy/cdn` deployments. Pre-installs Bun + nginx + lego,
# the workspace at `/socle/`, and a runtime app dir at `/app/` that already
# resolves the cdn libs via `link:` deps.
#
# Build context MUST be the monorepo root:
#     docker build -f docker/cdn/Dockerfile -t bernouy/cdn-base:0.1.0 .
#
# Users extend this image with their own bootstrap:
#     FROM bernouy/cdn-base:0.1.0
#     COPY server.ts /app/server.ts
#     # ENTRYPOINT + default CMD are inherited.

FROM oven/bun:1-alpine

RUN apk add --no-cache nginx lego bash gettext su-exec sudo curl

# Dedicated runtime user; nginx joins its group so it can read through the
# blob root's 0750 wall.
RUN addgroup -S cdn \
 && adduser -S -G cdn cdn \
 && addgroup nginx cdn

# 1. Vendor @bernouy/webcomponents (sibling workspace package, not yet on npm).
#    Pass via `docker buildx build --build-context webcomponents=/path/to/WebComponents`.
#    Mounted at /WebComponents to match the workspace path declared in
#    socle's package.json (`workspaces: ["packages/*", "../WebComponents"]`).
COPY --from=webcomponents . /WebComponents/

# 2. Copy the workspace + build (TS project refs emit dist/ for every package).
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
RUN bun install && bunx tsc --build

# 2. Set up the user app dir with the cdn libs already resolved.
WORKDIR /app
COPY docker/cdn/runtime.package.json /app/package.json
RUN bun install

# 3. Runtime layout + permissions.
RUN mkdir -p /var/storage/buckets /etc/lego /etc/nginx/conf.d/cdn/generated \
 && chown -R cdn:cdn /var/storage/buckets /etc/lego \
 && chmod 0750 /var/storage/buckets \
 && touch /etc/nginx/conf.d/cdn/generated/cacheControls.conf \
          /etc/nginx/conf.d/cdn/generated/aliases.conf \
          /etc/nginx/conf.d/cdn/generated/aliasesServers.conf

# 4. Nginx skeleton (template substituted at startup with ${MAIN_DOMAIN}).
COPY packages/cdn/nginx/bucketServing.conf /etc/nginx/conf.d/cdn/bucketServing.conf
COPY docker/cdn/nginx.conf.template        /etc/nginx/conf.d/cdn/nginx.conf.template
RUN echo "include /etc/nginx/conf.d/cdn/nginx.conf;" > /etc/nginx/http.d/cdn.conf

# 5. Sudoers rule — the cdn user can reload nginx (and only that).
RUN echo "cdn ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload" > /etc/sudoers.d/cdn \
 && chmod 0440 /etc/sudoers.d/cdn

# 6. Entrypoint owns: nginx render → wildcard provisioning → process supervision.
COPY docker/cdn/entrypoint.sh /usr/local/bin/cdn-entrypoint.sh
RUN chmod +x /usr/local/bin/cdn-entrypoint.sh

EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/cdn-entrypoint.sh"]
CMD ["bun", "run", "/app/server.ts"]
