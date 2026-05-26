#!/bin/bash
# cms-tp entrypoint — dev only. No OKMS, no KEK; logs are in-memory and the
# per-tenant CMS data lives in the shared Mongo. The bun app runs as the
# unprivileged `dp` user and serves plain HTTP on :3000 (override via PORT).

set -e

: "${TP_PUBLIC_URL:?TP_PUBLIC_URL is required (URL the hub fetches this TP at)}"
: "${HUB_ISSUER_URL:?HUB_ISSUER_URL is required (the hub iss — must match what the hub publishes)}"
: "${MONGO_URL:?MONGO_URL is required (per-tenant CMS data store)}"

echo "[cms-tp] iss=${TP_PUBLIC_URL}, trusts hub=${HUB_ISSUER_URL}, mongo=${MONGO_DB_NAME:-cms_dev}"
exec su -s /bin/bash dp -c "bun run /app/server.ts"
