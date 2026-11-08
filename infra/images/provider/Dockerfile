# Ulvia Provider image. Build context: workspace root.

# Independent of application sources: reuse both the layer and verified download cache.
FROM oven/bun:1.4.4-debian@sha256:93d5032fe06d163427822dc1598f420363759bb18155c9cc90eb1be05a64a19e AS embedding-model
WORKDIR /model-build
COPY infra/models/ ./
RUN --mount=type=cache,id=ulvia-embedding-models,target=/var/cache/ulvia-models,sharing=locked \
    bun run prepare.ts /opt/ulvia/models /var/cache/ulvia-models

FROM oven/bun:1.4.4-debian@sha256:93d5032fe06d163427822dc1598f420363759bb18155c9cc90eb1be05a64a19e AS build

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tsconfig.json build.ts ./
COPY infra/bootstrap.ts infra/execution-support.ts ./infra/
COPY packages/ ./packages/

RUN bun install --frozen-lockfile
RUN bunx tsc --build packages/runtimes/ulvia-provider-server
RUN cd packages/features/content && bun run build:browser
RUN bun run generate:official-bootstrap --core-only

FROM build AS runtime-source
RUN rm -rf /app/node_modules /app/packages/*/node_modules /app/packages/*/*/node_modules \
    /app/packages/official-repository/collections \
    /app/packages/runtimes/ulvia-cli/dist/bootstrap /app/packages/runtimes/ulvia-cli/dist/bootstrap-core

# ONNX Runtime's CPU bindings require glibc; the Provider's embedding model cannot run on musl.
FROM oven/bun:1.4.4-debian@sha256:93d5032fe06d163427822dc1598f420363759bb18155c9cc90eb1be05a64a19e AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

ARG IMAGE_VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Ulvia Provider" \
      org.opencontainers.image.description="Official multi-instance Ulvia Provider runtime" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      io.ulvia.component="provider" \
      io.ulvia.stack-api="1"

WORKDIR /app
COPY --from=embedding-model /opt/ulvia/models/ /opt/ulvia/models/
COPY --chown=bun:bun --from=runtime-source /app/package.json /app/bun.lock /app/tsconfig.base.json /app/tsconfig.json ./
COPY --chown=bun:bun --from=runtime-source /app/packages/ ./packages/

RUN install -d -o bun -g bun /var/lib/cms/files && chown bun:bun /app
USER bun
RUN bun install --frozen-lockfile --production --filter=@bernouy/ulvia-provider-server

ENV NODE_ENV=production \
    MODE=PROD \
    ULVIA_EMBEDDING_MODEL_DIR=/opt/ulvia/models \
    CMS_FILES_DIR=/var/lib/cms/files \
    ULVIA_PROVIDER_HOST=0.0.0.0 \
    ULVIA_PROVIDER_PORT=5103

VOLUME ["/var/lib/cms/files"]
EXPOSE 5103

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD ["bun", "-e", "const port=process.env.ULVIA_PROVIDER_PORT||'5103'; const token=process.env.ULVIA_PROVIDER_OPERATOR_TOKEN||''; const r=await fetch(`http://127.0.0.1:${port}/ulvia/operator/instances`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(9000)}); if(!r.ok) process.exit(1); await r.body?.cancel()"]

CMD ["bun", "--no-macros", "run", "packages/runtimes/ulvia-provider-server/src/index.ts"]
