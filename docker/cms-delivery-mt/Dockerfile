# Multi-tenant Delivery cron — pure offline worker.
# No nginx, no TLS, no inbound HTTP. Just bun + Playwright + Chromium for
# the build-time image-measurement step.

FROM debian:bookworm-slim

ARG BUN_VERSION=1.3.6

# 1. System deps + Bun + Chromium dependencies for Playwright.
#    The chromium-driver package pulls in the runtime libs Playwright needs;
#    `playwright install chromium` (run later from the workspace) downloads
#    the actual browser binary.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl unzip ca-certificates fonts-liberation libnss3 libatk-bridge2.0-0 \
        libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
        libxrandr2 libgtk-3-0 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
 && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o /tmp/bun.zip \
 && unzip -q /tmp/bun.zip -d /tmp \
 && mv /tmp/bun-linux-x64/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun.zip /tmp/bun-linux-x64 \
 && rm -rf /var/lib/apt/lists/*

# 2. Dedicated user; Playwright needs a writable home for its browser cache.
RUN groupadd -r delivery \
 && useradd -r -g delivery -d /home/delivery -s /usr/sbin/nologin -m delivery

# 3. Workspace install + build (same shape as cms-control-mt).
WORKDIR /socle
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY build.ts ./
RUN bun install && bun run build

# 4. Install the Playwright Chromium binary system-wide so the cron user
#    can find it. `--with-deps` would re-install system libs we already
#    have above, so we skip it.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN mkdir -p $PLAYWRIGHT_BROWSERS_PATH \
 && cd /socle && bunx playwright install chromium \
 && chown -R delivery:delivery $PLAYWRIGHT_BROWSERS_PATH

# 5. App layout.
WORKDIR /app
COPY docker/cms-delivery-mt/runtime.package.json /app/package.json
RUN ln -s /socle/node_modules /app/node_modules
COPY docker/cms-delivery-mt/server.ts /app/server.ts
RUN chown -R delivery:delivery /app

USER delivery
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
ENTRYPOINT ["bun", "run", "/app/server.ts"]
