#!/bin/bash
# okms-fetch.sh — bootstrap wrapper that pulls a config bundle from
# OVHcloud Secret Manager (OKMS) at container startup and exposes its
# keys as env vars before exec'ing the wrapped service entrypoint.
#
# Wire-up (Dockerfile):
#
#   COPY docker/_shared/okms-fetch.sh /usr/local/bin/okms-fetch
#   RUN chmod +x /usr/local/bin/okms-fetch
#   ENTRYPOINT ["/usr/local/bin/okms-fetch", "/usr/local/bin/<service>-entrypoint.sh"]
#
# The host's `bootstrap.env` (mounted via `--env-file`) provides the
# OKMS_* vars below. Auth is **mTLS** — the access cert + private key
# generated in the OVHcloud Manager (one per service) are mounted
# read-only into the container; their in-container paths are passed
# via OKMS_CERT_PATH and OKMS_KEY_PATH.
#
# The service entrypoint that runs after this wrapper inherits the
# bundle's keys as regular env vars — no code change needed on the
# entrypoint side.
#
# Bundle path is the full value of `${OKMS_SECRET_PREFIX}` — pass it as
# you saved the secret in OKMS (e.g. `prod/auth/config`). The KV2 response
# shape is `{ data: { data: { KEY: "value", ... } } }` — every key in the
# inner `data` object becomes an env var of the same name.
#
# Failure modes are loud and fail-fast: a wrong cert, a missing bundle,
# or a malformed response all kill the container at boot rather than
# limp along with stale / partial config.

set -euo pipefail

LOG_PREFIX="${LOG_PREFIX:-okms-fetch}"
log() { printf "[%s] %s\n" "${LOG_PREFIX}" "$*" >&2; }

# Dev escape hatch — when OKMS_SKIP=1, we don't talk to OKMS at all and
# chain straight to the wrapped entrypoint. The service's own env vars
# must come from `--env-file` / `-e` instead of the OKMS bundle. We
# additionally require `HUB_ENV=dev` so that an accidentally-leaked
# OKMS_SKIP=1 in a prod container is rejected at boot rather than
# silently disabling the safety net.
if [ "${OKMS_SKIP:-0}" = "1" ]; then
    if [ "${HUB_ENV:-}" != "dev" ]; then
        log "FATAL: OKMS_SKIP=1 requires HUB_ENV=dev. Refusing to boot — this flag must NEVER be set in production."
        exit 7
    fi
    log "OKMS_SKIP=1 (HUB_ENV=dev) — bypassing bundle fetch. Keys must come from --env-file / -e."
    exec "$@"
fi

: "${OKMS_REGION:?OKMS_REGION is required (e.g. eu-west-par)}"
: "${OKMS_DOMAIN_ID:?OKMS_DOMAIN_ID is required (uuid of the OKMS domain)}"
: "${OKMS_CERT_PATH:?OKMS_CERT_PATH is required (in-container path to the OKMS access cert .pem)}"
: "${OKMS_KEY_PATH:?OKMS_KEY_PATH is required (in-container path to the OKMS access key .pem)}"
: "${OKMS_SECRET_PREFIX:?OKMS_SECRET_PREFIX is required (full secret path, e.g. prod/auth/config)}"

# Pre-flight: cert + key must exist and be readable. Refuse to boot if
# the private key has world/group perms — same hygiene as ssh.
if [ ! -r "${OKMS_CERT_PATH}" ]; then
    log "FATAL: access cert not readable at '${OKMS_CERT_PATH}'. Mount it with `-v <host-path>:${OKMS_CERT_PATH}:ro`."
    exit 1
fi
if [ ! -r "${OKMS_KEY_PATH}" ]; then
    log "FATAL: access key not readable at '${OKMS_KEY_PATH}'. Mount it with `-v <host-path>:${OKMS_KEY_PATH}:ro`."
    exit 1
fi
KEY_PERMS=$(stat -c "%a" "${OKMS_KEY_PATH}" 2>/dev/null || echo "")
# Owner-only perms only. Anything group/world readable (e.g. 0640) is rejected.
# The empty-string branch tolerates `stat` failures (FS doesn't support it).
case "${KEY_PERMS}" in
    400|600|0400|0600|"") ;;
    *)
        log "FATAL: access key '${OKMS_KEY_PATH}' has lax perms (${KEY_PERMS}). Set 0400 or 0600 on the host file."
        exit 1
        ;;
esac

URL="https://${OKMS_REGION}.okms.ovh.net/api/${OKMS_DOMAIN_ID}/v1/secret/data/${OKMS_SECRET_PREFIX}"
TMP_BODY=$(mktemp)
trap 'rm -f "${TMP_BODY}"' EXIT

# Retry on 5xx / network errors (max 4 attempts, exponential backoff
# starting at 2s = up to ~30s total). Auth and 404 fail immediately —
# retrying won't fix a wrong cert or a missing bundle.
attempt=0
max_attempts=4
backoff=2
http_status=0

while [ "${attempt}" -lt "${max_attempts}" ]; do
    attempt=$((attempt + 1))
    http_status=$(curl -sS --max-time 20 -o "${TMP_BODY}" -w "%{http_code}" \
        --cert "${OKMS_CERT_PATH}" --key "${OKMS_KEY_PATH}" \
        "${URL}" || echo "000")
    case "${http_status}" in
        200)
            log "fetched bundle (attempt ${attempt}, prefix=${OKMS_SECRET_PREFIX})"
            break
            ;;
        401|403)
            log "FATAL: OKMS auth refused (HTTP ${http_status}). Check that the cert is authorized on '${OKMS_SECRET_PREFIX}/config'."
            exit 2
            ;;
        404)
            log "FATAL: bundle not found at path '${OKMS_SECRET_PREFIX}' (HTTP 404). Provision it via Manager / okms-cli first."
            exit 3
            ;;
        000|5*)
            if [ "${attempt}" -lt "${max_attempts}" ]; then
                log "transient error (HTTP ${http_status}), retry in ${backoff}s…"
                sleep "${backoff}"
                backoff=$((backoff * 2))
            else
                log "FATAL: transient errors persisted across ${max_attempts} attempts."
                exit 4
            fi
            ;;
        *)
            log "FATAL: unexpected HTTP ${http_status} from OKMS. Body:"
            cat "${TMP_BODY}" >&2
            exit 5
            ;;
    esac
done

# Parse the KV2 response. `.data.data` is an object whose keys are
# the env var names. Anything else (missing, null, non-object) is fatal.
keys=$(jq -r 'if (.data.data | type) == "object" then .data.data | keys[] else empty end' "${TMP_BODY}" 2>/dev/null || true)
if [ -z "${keys}" ]; then
    log "FATAL: bundle response had no '.data.data' object or it was empty. Raw response:"
    cat "${TMP_BODY}" >&2
    exit 6
fi

# Export each key. We intentionally never log the values — only the key
# names — so a captured stderr never leaks secrets.
exported=""
while IFS= read -r key; do
    [ -z "${key}" ] && continue
    value=$(jq -r --arg k "${key}" '.data.data[$k]' "${TMP_BODY}")
    export "${key}=${value}"
    exported="${exported} ${key}"
done <<< "${keys}"

log "exported keys:${exported}"

# Chain to the wrapped entrypoint. `exec` replaces the shell with the
# next process; the env we just exported propagates by inheritance.
exec "$@"
