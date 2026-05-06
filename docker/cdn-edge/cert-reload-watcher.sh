#!/bin/bash
# cert-reload-watcher.sh — when files in /var/lib/cdn/lego/certificates/
# or /var/lib/cdn/nginx-generated/ change (i.e. lsyncd just pushed a
# cert or an updated nginx fragment), reload nginx so it picks up the
# change without restarting the container.
#
# Two-stage debounce after each event:
#  1) Coalesce subsequent inotify events within DEBOUNCE_SECONDS.
#  2) If `nginx -t` fails (mid-rsync state, partial files), retry with
#     a backoff up to RETRY_MAX_SECONDS — without this, a transient
#     parse failure would leave nginx un-reloaded until the next event,
#     which can take days for an idle cluster.

set -u

WATCH_DIRS=(
    "/var/lib/cdn/lego/certificates"
    "/var/lib/cdn/nginx-generated"
)
DEBOUNCE_SECONDS="${RELOAD_DEBOUNCE_SECONDS:-5}"
RETRY_MAX_SECONDS="${RELOAD_RETRY_MAX_SECONDS:-300}"

echo "[cert-reload-watcher] watching ${WATCH_DIRS[*]} (debounce ${DEBOUNCE_SECONDS}s, retry up to ${RETRY_MAX_SECONDS}s)"

attempt_reload() {
    # Returns 0 on successful reload, 1 if config still bad. Caller
    # handles backoff and retry.
    if /usr/sbin/nginx -t 2>/dev/null; then
        echo "[cert-reload-watcher] config OK → reloading nginx"
        sudo /usr/sbin/nginx -s reload && return 0
        echo "[cert-reload-watcher] reload command failed (will retry)"
        return 1
    fi
    return 1
}

reload_with_backoff() {
    # Try the reload; on failure, retry with capped exponential backoff
    # until RETRY_MAX_SECONDS elapsed. Each delay logged so an operator
    # tailing the logs can see we're still trying.
    local delay=2
    local elapsed=0
    while ! attempt_reload; do
        if [ "${elapsed}" -ge "${RETRY_MAX_SECONDS}" ]; then
            echo "[cert-reload-watcher] giving up after ${elapsed}s — waiting for next event"
            return 1
        fi
        echo "[cert-reload-watcher] nginx -t failing, retrying in ${delay}s (elapsed ${elapsed}s/${RETRY_MAX_SECONDS}s)"
        sleep "${delay}"
        elapsed=$(( elapsed + delay ))
        # Double the delay up to 30s ceiling.
        delay=$(( delay * 2 ))
        [ "${delay}" -gt 30 ] && delay=30
    done
    return 0
}

while true; do
    # Block until something changes.
    inotifywait -q -e close_write -e moved_to -e create -e delete \
                "${WATCH_DIRS[@]}" >/dev/null 2>&1 \
        || { echo "[cert-reload-watcher] inotifywait failed, sleeping 10s"; sleep 10; continue; }

    # Coalesce subsequent events within the debounce window.
    while inotifywait -q -t "${DEBOUNCE_SECONDS}" \
                      -e close_write -e moved_to -e create -e delete \
                      "${WATCH_DIRS[@]}" >/dev/null 2>&1; do
        :
    done

    reload_with_backoff || true
done
