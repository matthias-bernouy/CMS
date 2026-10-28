# Ulvia Provider image. Build context: workspace root.

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS build

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tsconfig.json build.ts ./
COPY packages/ ./packages/

RUN bun install --frozen-lockfile
RUN bunx tsc --build packages/runtimes/ulvia-provider-server
RUN cd packages/features/cms-content && bun run build:browser

FROM build AS runtime-source
RUN rm -rf /app/node_modules /app/packages/*/node_modules /app/packages/*/*/node_modules

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS runtime

ARG IMAGE_VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Ulvia Provider" \
      org.opencontainers.image.description="Official multi-instance Ulvia Provider runtime" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      io.ulvia.component="provider" \
      io.ulvia.stack-api="1"

WORKDIR /app
COPY --chown=bun:bun --from=runtime-source /app/package.json /app/bun.lock /app/tsconfig.base.json /app/tsconfig.json ./
COPY --chown=bun:bun --from=runtime-source /app/packages/ ./packages/

RUN install -d -o bun -g bun /var/lib/cms/files && chown bun:bun /app
USER bun
RUN bun install --frozen-lockfile --production --filter=@bernouy/ulvia-provider-server

ENV NODE_ENV=production \
    MODE=PROD \
    CMS_FILES_DIR=/var/lib/cms/files \
    ULVIA_PROVIDER_HOST=0.0.0.0 \
    ULVIA_PROVIDER_PORT=5103

VOLUME ["/var/lib/cms/files"]
EXPOSE 5103

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD ["bun", "-e", "const port=process.env.ULVIA_PROVIDER_PORT||'5103'; const token=process.env.ULVIA_PROVIDER_OPERATOR_TOKEN||''; const r=await fetch(`http://127.0.0.1:${port}/ulvia/operator/instances`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(9000)}); if(!r.ok) process.exit(1); await r.body?.cancel()"]

CMD ["bun", "--no-macros", "run", "packages/runtimes/ulvia-provider-server/src/index.ts"]
