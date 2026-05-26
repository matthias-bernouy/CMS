#!/bin/bash
# example-tp entrypoint — dev only. No OKMS, no KEK; the TP is in-memory.
# The bun app runs as the unprivileged `dp` user and serves plain HTTP on :3000.

set -e

: "${TP_PUBLIC_URL:?TP_PUBLIC_URL is required (URL the hub fetches this TP at)}"
: "${HUB_ISSUER_URL:?HUB_ISSUER_URL is required (the hub iss — must match what the hub publishes)}"

echo "[example-tp] iss=${TP_PUBLIC_URL}, trusts hub=${HUB_ISSUER_URL}"
exec su -s /bin/bash dp -c "bun run /app/server.ts"
