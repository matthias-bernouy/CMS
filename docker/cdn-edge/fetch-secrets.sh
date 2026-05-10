#!/bin/bash
# fetch-secrets.sh — pull the proxy-secrets manifest from the origin and
# trigger a nginx reload whenever it changes.
#
# Conditional GET against /edge-api/secrets with `If-None-Match`. The
# response body is `{ etag, manifest: { SECRET_xxx: "value" } }` — we
# write it verbatim to `/run/cdn-edge/secrets.json` (tmpfs) and run
# `nginx -s reload`. The nginx `init_by_lua_block` (defined in
# nginx.conf) reads the JSON file at config-load time and populates the
# `cms_secrets` Lua table the per-location `set_by_lua_block`s read.
# Plaintext never touches persistent disk.
#
# Usage:
#   fetch-secrets.sh once   — single fetch (used at boot)
#   fetch-secrets.sh loop   — poll forever (default)
#
# Env:
#   ORIGIN_HOST              required, e.g. cdn-origin.example.com
#   EDGE_TOKEN               OR  /run/secrets/edge-token              (required)
#   SECRETS_POLL_INTERVAL    seconds, default 10
#   ORIGIN_SCHEME            default https

set -u

POLL_INTERVAL="${SECRETS_POLL_INTERVAL:-10}"
SCHEME="${ORIGIN_SCHEME:-https}"
ORIGIN_HOST="${ORIGIN_HOST:?ORIGIN_HOST is required}"
TOKEN_FILE=/run/secrets/edge-token
RUN_DIR=/run/cdn-edge
ETAG_FILE="${RUN_DIR}/.secrets-etag"
SECRETS_FILE="${RUN_DIR}/secrets.json"

mkdir -p "${RUN_DIR}"
chmod 0700 "${RUN_DIR}" 2>/dev/null || true

if [ -n "${EDGE_TOKEN:-}" ]; then
    TOKEN="${EDGE_TOKEN}"
elif [ -r "${TOKEN_FILE}" ]; then
    TOKEN=$(tr -d '\r\n' < "${TOKEN_FILE}")
else
    echo "[fetch-secrets] FATAL: EDGE_TOKEN env var unset and ${TOKEN_FILE} not readable" >&2
    exit 2
fi

URL="${SCHEME}://${ORIGIN_HOST}/edge-api/secrets"

reload_nginx() {
    if /usr/sbin/nginx -t 2>/dev/null; then
        sudo /usr/sbin/nginx -s reload
    else
        echo "[fetch-secrets] nginx -t failed — keeping previous runtime" >&2
        return 1
    fi
}

fetch_once() {
    local current_etag=""
    [ -f "${ETAG_FILE}" ] && current_etag=$(cat "${ETAG_FILE}")

    local response status body
    response=$(curl -sS --max-time 30 -w "\n%{http_code}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "If-None-Match: \"${current_etag}\"" \
        "${URL}" 2>/dev/null) || {
        echo "[fetch-secrets] curl failed (origin unreachable?)" >&2
        return 1
    }
    status=$(printf "%s" "${response}" | tail -n1)
    body=$(printf "%s" "${response}" | sed '$d')

    case "${status}" in
        304) return 0 ;;
        200)
            local new_etag tmp
            new_etag=$(printf "%s" "${body}" | jq -r '.etag') || {
                echo "[fetch-secrets] could not parse response" >&2
                return 1
            }
            tmp="${SECRETS_FILE}.tmp"
            # Pretty-print + sanitize through jq so the file is well-formed
            # JSON whatever the origin sends; a stray HTML response would
            # fail to parse and we'd skip the rename.
            printf "%s" "${body}" | jq '.' > "${tmp}" || return 1
            mv "${tmp}" "${SECRETS_FILE}"
            printf "%s" "${new_etag}" > "${ETAG_FILE}"
            local entries
            entries=$(jq '.manifest | length' < "${SECRETS_FILE}")
            echo "[fetch-secrets] manifest updated (etag=${new_etag}, ${entries} entries)"
            reload_nginx || return 1
            ;;
        401)
            echo "[fetch-secrets] FATAL: edge token rejected by origin (401)" >&2
            return 2 ;;
        *)
            echo "[fetch-secrets] WARN: unexpected status ${status}" >&2
            return 1 ;;
    esac
}

case "${1:-loop}" in
    once)
        fetch_once
        exit $?
        ;;
    loop)
        echo "[fetch-secrets] polling ${URL} every ${POLL_INTERVAL}s"
        while true; do
            fetch_once || true
            sleep "${POLL_INTERVAL}"
        done
        ;;
    *)
        echo "Usage: $0 [once|loop]" >&2
        exit 64
        ;;
esac
