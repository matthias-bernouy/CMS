# Dedicated integration repository image. Build context is the workspace root.

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tsconfig.json build.ts ./
COPY packages/ ./packages/

RUN bun install --frozen-lockfile
RUN bun run build

FROM build AS runtime-source
RUN rm -rf /app/node_modules /app/packages/*/*/node_modules

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runtime

ARG IMAGE_VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="@bernouy/cms-repository-server" \
      org.opencontainers.image.description="CmsCore global integration repository runtime" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

WORKDIR /app
COPY --chown=bun:bun --from=runtime-source /app/package.json /app/bun.lock /app/tsconfig.base.json /app/tsconfig.json ./
COPY --chown=bun:bun --from=runtime-source /app/packages/ ./packages/

RUN install -d -o bun -g bun -m 0750 /var/lib/cms-repository/registry && chown bun:bun /app
USER bun

RUN bun install --frozen-lockfile --production --omit=peer --filter=@bernouy/cms-repository-server

ENV NODE_ENV=production \
    CMS_REPOSITORY_REGISTRY_ROOT=/var/lib/cms-repository/registry \
    CMS_REPOSITORY_MANAGEMENT_TOKEN_FILE=/run/secrets/cms-repository-management-token

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["bun", "-e", "const port = process.env.CMS_REPOSITORY_MANAGEMENT_PORT || '3000'; const response = await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(4000) }); if (!response.ok) process.exit(1); await response.body?.cancel();"]

CMD ["bun", "run", "packages/runtimes/cms-repository-server/src/index.ts"]
