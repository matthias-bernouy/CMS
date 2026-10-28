# Ulvia Edge image. Build context: workspace root.

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS build

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tsconfig.json build.ts ./
COPY packages/ ./packages/

RUN bun install --frozen-lockfile
RUN bunx tsc --build packages/runtimes/cms-edge-server

FROM build AS runtime-source
RUN rm -rf /app/node_modules /app/packages/*/node_modules /app/packages/*/*/node_modules

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS runtime

ARG IMAGE_VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Ulvia Edge" \
      org.opencontainers.image.description="Stateless Ulvia CMS Edge runtime" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      io.ulvia.component="edge" \
      io.ulvia.stack-api="1"

WORKDIR /app
COPY --chown=bun:bun --from=runtime-source /app/package.json /app/bun.lock /app/tsconfig.base.json /app/tsconfig.json ./
COPY --chown=bun:bun --from=runtime-source /app/packages/ ./packages/

RUN chown bun:bun /app
USER bun
RUN bun install --frozen-lockfile --production --filter=@bernouy/cms-edge-server

ENV NODE_ENV=production \
    MODE=PROD \
    CMS_HOST=0.0.0.0 \
    CMS_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD ["bun", "-e", "const port=process.env.CMS_PORT||'3000'; const r=await fetch(`http://127.0.0.1:${port}/login`,{signal:AbortSignal.timeout(9000)}); if(r.status>=500) process.exit(1); await r.body?.cancel()"]

CMD ["bun", "run", "packages/runtimes/cms-edge-server/src/index.ts"]
