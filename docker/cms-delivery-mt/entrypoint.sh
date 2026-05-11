#!/bin/bash
# cms-delivery-mt entrypoint:
#   1. Runs as root (after okms-fetch has exported env vars).
#   2. Drops to the unprivileged `delivery` user to run bun, so the
#      Playwright Chromium process and Mongo client never run as root.

set -e

: "${MONGO_URL:?MONGO_URL is required}"

exec su -s /bin/bash delivery -c "bun run /app/server.ts"
