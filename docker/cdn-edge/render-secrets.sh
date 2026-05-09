#!/bin/bash
# render-secrets.sh — resolve `${SECRET_<hex>}` placeholders in the
# lsynced `aliasesServers.conf` template into the nginx runtime config.
#
# Reads the manifest env file written by `fetch-secrets.sh`, applies
# `envsubst` against the template (allowlisted to SECRET_* names so we
# never accidentally expand a literal $variable in the nginx config),
# and atomically writes the resolved fragment to `/run/nginx-runtime/`.
#
# Idempotent — same input yields same output. Safe to call from both
# the cert-reload-watcher (template changed, lsync just pushed) and
# fetch-secrets (manifest changed, /edge-api/secrets returned 200).

set -u

TEMPLATE=/var/lib/cdn/nginx-generated/aliasesServers.conf
RUNTIME_DIR=/run/nginx-runtime
RUNTIME_FILE="${RUNTIME_DIR}/aliasesServers.conf"
ENV_FILE=/run/cdn-edge/.secrets-env

mkdir -p "${RUNTIME_DIR}"

if [ ! -f "${TEMPLATE}" ]; then
    # Boot ordering: lsynced template not landed yet. Emit empty so
    # nginx -t passes and let later events repaint.
    : > "${RUNTIME_FILE}"
    exit 0
fi

# Source the manifest env file if present. Each line is `SECRET_xxx="value"`
# (written by fetch-secrets.sh, which sanitises through jq).
if [ -f "${ENV_FILE}" ]; then
    set -a
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    set +a
fi

# Build the allowlist of variables envsubst is allowed to substitute.
# Keeps any unrelated `${...}` in the template literal — defensive.
ALLOWED=$(env | awk -F= '/^SECRET_[A-Z0-9]+=/ { printf " ${%s}", $1 }')

TMP="${RUNTIME_FILE}.tmp"
envsubst "${ALLOWED}" < "${TEMPLATE}" > "${TMP}"
mv "${TMP}" "${RUNTIME_FILE}"
