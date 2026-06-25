# Basic CMS image — single Bun process for Control + Delivery.
# Build context is the repo root (the workspace must be fully available).

FROM oven/bun:1.3-alpine AS build

WORKDIR /app

# Copy the whole workspace — small enough to be fine; lets bun resolve every
# `workspace:*` dep without a curated subset.
COPY package.json bun.lock tsconfig.base.json tsconfig.json build.ts ./
COPY packages/ ./packages/
COPY infra/images/ ./infra/images/

RUN bun install --frozen-lockfile
RUN bun run build

# Runtime stage — keep the built workspace, drop the build tooling layer.
FROM oven/bun:1.3-alpine

WORKDIR /app
COPY --from=build /app /app

ENV NODE_ENV=production
EXPOSE 3000 3001

CMD ["bun", "run", "packages/runtimes/cms-server/src/index.ts"]
