# Verifier supervisor and fixed sandbox image. Build context is the workspace root.

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

LABEL org.opencontainers.image.title="@bernouy/cms-integration-verifier" \
      org.opencontainers.image.description="Isolated integration verification supervisor and sandbox" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

RUN addgroup -S -g 1001 verifier \
    && adduser -S -D -H -u 1001 -G verifier verifier \
    && addgroup -S -g 1002 verifier-sandbox \
    && adduser -S -D -H -u 1002 -G verifier-sandbox verifier-sandbox

WORKDIR /app
COPY --chown=verifier:verifier --from=runtime-source /app/package.json /app/bun.lock /app/tsconfig.base.json /app/tsconfig.json ./
COPY --chown=verifier:verifier --from=runtime-source /app/packages/ ./packages/

RUN install -d -o verifier -g verifier -m 0750 /var/lib/cms-integration-verifier \
    && chown verifier:verifier /app
USER verifier
RUN bun install --frozen-lockfile --production --omit=peer --filter=@bernouy/cms-integration-verifier

ENV NODE_ENV=production \
    CMS_INTEGRATION_VERIFIER_HEALTH_PORT=3100

EXPOSE 3100 3101

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["bun", "-e", "const response = await fetch('http://127.0.0.1:3100/ready', { signal: AbortSignal.timeout(4000) }); if (!response.ok) process.exit(1); await response.body?.cancel();"]

CMD ["bun", "run", "packages/runtimes/cms-integration-verifier/src/runtime/main.ts"]
