FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS build

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tsconfig.json build.ts ./
COPY packages/ ./packages/
RUN bun install --frozen-lockfile
RUN bunx tsc --build packages/runtimes/official-repository-server

FROM build AS runtime-source
RUN rm -rf /app/node_modules /app/packages/*/*/node_modules

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS runtime

ARG IMAGE_VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="@bernouy/official-repository-server" \
      org.opencontainers.image.description="Official immutable Ulvia repository runtime" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

WORKDIR /app
COPY --chown=bun:bun --from=runtime-source /app/package.json /app/bun.lock /app/tsconfig.base.json /app/tsconfig.json ./
COPY --chown=bun:bun --from=runtime-source /app/packages/ ./packages/

RUN install -d -o bun -g bun /var/lib/ulvia-repository && chown bun:bun /app
USER bun
RUN bun install --frozen-lockfile --production --omit=peer --filter=@bernouy/official-repository-server

ENV NODE_ENV=production \
    REPOSITORY_HOST=0.0.0.0 \
    REPOSITORY_PORT=3000 \
    ULVIA_REPOSITORY_DIR=/var/lib/ulvia-repository

VOLUME ["/var/lib/ulvia-repository"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["bun", "-e", "const port = process.env.REPOSITORY_PORT || '3000'; const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(4000) }); if (!response.ok) process.exit(1); await response.body?.cancel();"]

CMD ["bun", "run", "packages/runtimes/official-repository-server/src/index.ts"]
