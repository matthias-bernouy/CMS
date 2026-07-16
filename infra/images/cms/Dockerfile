# CMS image — single Bun process for Control + Delivery.
# Build context is the repo root (the workspace must be fully available).

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build

WORKDIR /app

# Copy the whole workspace so Bun can resolve every `workspace:*` dependency.
COPY package.json bun.lock tsconfig.base.json tsconfig.json build.ts ./
COPY packages/ ./packages/

RUN bun install --frozen-lockfile
RUN bun run build

# Remove build-only installs before copying the generated workspace into the
# runtime stage. The production install below recreates the workspace links.
FROM build AS runtime-source
RUN rm -rf /app/node_modules /app/packages/*/*/node_modules

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runtime

ARG IMAGE_VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="@bernouy/cms-server" \
      org.opencontainers.image.description="CmsCore Control and Delivery runtime" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

WORKDIR /app
COPY --chown=bun:bun --from=runtime-source /app/package.json /app/bun.lock /app/tsconfig.base.json /app/tsconfig.json ./
COPY --chown=bun:bun --from=runtime-source /app/packages/ ./packages/

RUN install -d -o bun -g bun /var/lib/cms/files && chown bun:bun /app
USER bun

# TypeScript is transpiled by Bun at runtime; peer-only type tooling is not
# needed in production. The filter retains cms-server's full workspace closure.
RUN bun install --frozen-lockfile --production --omit=peer --filter=@bernouy/cms-server

ENV NODE_ENV=production \
    MODE=PROD

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["bun", "-e", "const port = process.env.CONTROL_PORT || '3000'; const response = await fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(4000) }); if (!response.ok) process.exit(1); await response.body?.cancel();"]

CMD ["bun", "run", "packages/runtimes/cms-server/src/index.ts"]
