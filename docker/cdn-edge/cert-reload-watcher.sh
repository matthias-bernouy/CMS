#!/bin/bash
# cert-reload-watcher.sh — keep nginx aligned with what's on disk, both
# reactively (inotify on cert dir + nginx-generated) and proactively
# (periodic safety-net tick every RELOAD_PERIODIC_SECONDS).
#
# The proactive tick exists so a transient `nginx -t` failure during the
# event-driven retry-with-backoff (typically caused by partial files
# mid-rsync) can't permanently leave the watcher in "gave up" state.
# Even if inotify misses an event entirely (rare, but possible), the
# periodic re-attempt converges the running nginx with the on-disk state.
#
# Secrets reload (`fetch-secrets.sh` polling /edge-api/secrets) is a
# SEPARATE pipeline that triggers its own `nginx -s reload`; this
# watcher only cares about cert + lsynced-fragment changes.
#
# attempt_reload short-circuits when the input hash hasn't changed since
# the last successful reload — no log spam on idle clusters.

set -u

WATCH_DIRS=(
    "/var/lib/cdn/lego/certificates"
    "/var/lib/cdn/nginx-generated"
)
DEBOUNCE_SECONDS="${RELOAD_DEBOUNCE_SECONDS:-5}"
RETRY_MAX_SECONDS="${RELOAD_RETRY_MAX_SECONDS:-300}"
PERIODIC_SECONDS="${RELOAD_PERIODIC_SECONDS:-300}"
LAST_HASH_FILE=/run/cdn-edge/.last-reload-hash

mkdir -p "$(dirname "${LAST_HASH_FILE}")"

echo "[cert-reload-watcher] watching ${WATCH_DIRS[*]} (debounce ${DEBOUNCE_SECONDS}s, retry up to ${RETRY_MAX_SECONDS}s, periodic every ${PERIODIC_SECONDS}s)"

# Hash the inputs nginx actually parses, so we can skip a reload when
# nothing changed (avoids spamming `nginx -s reload` on every periodic
# tick for a stable cluster). Cheap — sha256 of a handful of small
# files, even with hundreds of certs.
NGINX_CONF="${NGINX_PREFIX:-/usr/local/openresty/nginx}/conf/cdn/nginx.conf"

current_hash() {
    {
        sha256sum "${NGINX_CONF}" 2>/dev/null
        sha256sum /var/lib/cdn/nginx-generated/aliases.conf 2>/dev/null
        sha256sum /var/lib/cdn/nginx-generated/aliasesServers.conf 2>/dev/null
        find /var/lib/cdn/lego/certificates -type f -exec sha256sum {} + 2>/dev/null | sort
    } | sha256sum | awk '{print $1}'
}

attempt_reload() {
    # Returns 0 on successful reload (or no-op if hash unchanged), 1 if
    # config still bad. Caller handles backoff and retry.
    local hash; hash=$(current_hash)
    local last=""; [ -f "${LAST_HASH_FILE}" ] && last=$(cat "${LAST_HASH_FILE}")
    if [ -n "${hash}" ] && [ "${hash}" = "${last}" ]; then
        # No-op: config is identical to the last successful reload.
        return 0
    fi

    if sudo /usr/sbin/nginx -t 2>/dev/null; then
        echo "[cert-reload-watcher] config OK → reloading nginx"
        if sudo /usr/sbin/nginx -s reload; then
            echo "${hash}" > "${LAST_HASH_FILE}"
            return 0
        fi
        echo "[cert-reload-watcher] reload command failed (will retry)"
        return 1
    fi
    return 1
}

reload_with_backoff() {
    # Try the reload; on failure, retry with capped exponential backoff
    # until RETRY_MAX_SECONDS elapsed. Each delay logged so an operator
    # tailing the logs can see we're still trying. If we give up here,
    # the periodic safety-net tick will pick it up again.
    local delay=2
    local elapsed=0
    while ! attempt_reload; do
        if [ "${elapsed}" -ge "${RETRY_MAX_SECONDS}" ]; then
            echo "[cert-reload-watcher] giving up after ${elapsed}s — periodic tick (${PERIODIC_SECONDS}s) will retry"
            return 1
        fi
        echo "[cert-reload-watcher] nginx -t failing, retrying in ${delay}s (elapsed ${elapsed}s/${RETRY_MAX_SECONDS}s)"
        sleep "${delay}"
        elapsed=$(( elapsed + delay ))
        delay=$(( delay * 2 ))
        [ "${delay}" -gt 30 ] && delay=30
    done
    return 0
}

while true; do
    # Block on inotify with a periodic timeout. inotifywait exit codes:
    #   0 → an event happened, run the event-driven path
    #   2 → timeout fired, run the periodic safety-net path
    #   >2 → real error (dir missing, kernel limit, …) — sleep + retry
    inotifywait -q -t "${PERIODIC_SECONDS}" \
                -e close_write -e moved_to -e create -e delete \
                "${WATCH_DIRS[@]}" >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -gt 2 ]; then
        echo "[cert-reload-watcher] inotifywait failed (rc=${rc}), sleeping 10s"
        sleep 10
        continue
    fi

    if [ "${rc}" -eq 0 ]; then
        # Event-driven: coalesce subsequent events, then retry-with-backoff.
        while inotifywait -q -t "${DEBOUNCE_SECONDS}" \
                          -e close_write -e moved_to -e create -e delete \
                          "${WATCH_DIRS[@]}" >/dev/null 2>&1; do
            :
        done
        reload_with_backoff || true
    else
        # rc=2 → periodic safety-net. Single attempt, no backoff. Hash
        # check inside attempt_reload makes this a no-op (silent) when
        # the config is stable, so no log spam on idle clusters.
        attempt_reload || true
    fi
done
