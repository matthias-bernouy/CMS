#!/bin/bash
# keycloak-tp entrypoint — dev only. No OKMS, no KEK; logs are in-memory. The
# TP authenticates to Keycloak with a client_credentials service account and
# runs as the unprivileged `dp` user on :3000 (override via PORT).

set -e

: "${TP_PUBLIC_URL:?TP_PUBLIC_URL is required (URL the hub fetches this TP at)}"
: "${HUB_ISSUER_URL:?HUB_ISSUER_URL is required (the hub iss — must match what the hub publishes)}"
: "${KEYCLOAK_BASE_URL:?KEYCLOAK_BASE_URL is required (target Keycloak base URL)}"
: "${KEYCLOAK_SA_CLIENT_ID:?KEYCLOAK_SA_CLIENT_ID is required (service-account client)}"
: "${KEYCLOAK_SA_CLIENT_SECRET:?KEYCLOAK_SA_CLIENT_SECRET is required}"

echo "[keycloak-tp] iss=${TP_PUBLIC_URL}, trusts hub=${HUB_ISSUER_URL}, keycloak=${KEYCLOAK_BASE_URL}"
exec su -s /bin/bash dp -c "bun run /app/server.ts"
