# Independent of application sources: reuse both the layer and verified download cache.
FROM oven/bun:1.4.2-debian@sha256:4f6e31d1a54d6a3dd312daef655fc998101b5043d52e12592ac293ef04b9bc73 AS embedding-model
WORKDIR /model-build
COPY infra/models/ ./
RUN --mount=type=cache,id=ulvia-embedding-models,target=/var/cache/ulvia-models,sharing=locked \
    bun run prepare.ts /opt/ulvia/models /var/cache/ulvia-models

FROM oven/bun:1.4.2-debian@sha256:4f6e31d1a54d6a3dd312daef655fc998101b5043d52e12592ac293ef04b9bc73 AS build

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tsconfig.json build.ts ./
COPY packages/ ./packages/
RUN bun install --frozen-lockfile
RUN bunx tsc --build packages/runtimes/official-repository-server
RUN bun run generate:official-bootstrap
RUN bun -e 'import { bootstrapOfficialRepository } from "./packages/runtimes/ulvia-cli/src/commands/bootstrap.ts"; await bootstrapOfficialRepository("/opt/ulvia-repository-seed")'

FROM build AS runtime-source
RUN rm -rf /app/node_modules /app/packages/*/*/node_modules

FROM oven/bun:1.4.2-debian@sha256:4f6e31d1a54d6a3dd312daef655fc998101b5043d52e12592ac293ef04b9bc73 AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

ARG IMAGE_VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Ulvia Official Repository" \
      org.opencontainers.image.description="Official immutable Ulvia repository runtime" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      io.ulvia.component="repository" \
      io.ulvia.stack-api="1"

WORKDIR /app
COPY --from=embedding-model /opt/ulvia/models/ /opt/ulvia/models/
COPY --chown=bun:bun --from=runtime-source /app/package.json /app/bun.lock /app/tsconfig.base.json /app/tsconfig.json ./
COPY --chown=bun:bun --from=runtime-source /app/packages/ ./packages/
COPY --chown=bun:bun --from=runtime-source /opt/ulvia-repository-seed/ /opt/ulvia-repository-seed/

RUN install -d -o bun -g bun /var/lib/ulvia-repository && chown bun:bun /app
USER bun
RUN bun install --frozen-lockfile --production --omit=peer --filter=@bernouy/official-repository-server

ENV NODE_ENV=production \
    ULVIA_EMBEDDING_MODEL_DIR=/opt/ulvia/models \
    REPOSITORY_HOST=0.0.0.0 \
    REPOSITORY_PORT=3000 \
    ULVIA_REPOSITORY_DIR=/var/lib/ulvia-repository/current \
    ULVIA_REPOSITORY_SEED_DIR=/opt/ulvia-repository-seed

VOLUME ["/var/lib/ulvia-repository"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["bun", "-e", "const port = process.env.REPOSITORY_PORT || '3000'; const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(4000) }); if (!response.ok) process.exit(1); await response.body?.cancel();"]

CMD ["bun", "run", "packages/runtimes/official-repository-server/src/index.ts"]
