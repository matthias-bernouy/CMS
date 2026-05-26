#!/bin/bash
# addresses-tp entrypoint — dev only. No OKMS, no KEK; stateless proxy to
# api-adresse.data.gouv.fr. Runs as the unprivileged `dp` user, plain HTTP.

set -e

: "${TP_PUBLIC_URL:?TP_PUBLIC_URL is required (URL the hub fetches this TP at)}"
: "${HUB_ISSUER_URL:?HUB_ISSUER_URL is required (the hub iss — must match what the hub publishes)}"

echo "[addresses-tp] iss=${TP_PUBLIC_URL}, trusts hub=${HUB_ISSUER_URL}"
exec su -s /bin/bash dp -c "bun run /app/server.ts"
