#!/bin/bash
# cert-reload-watcher.sh — when files in /var/lib/cdn/lego/certificates/
# or /var/lib/cdn/nginx-generated/ change (i.e. lsyncd just pushed a new
# wildcard cert, an alias cert, or an updated nginx fragment), reload
# nginx so it picks up the change without restarting the container.
#
# Debounce: lsyncd typically pushes a burst of files (cert.pem + key.pem
# + chain.pem in the same rsync run); we wait 5s after the last event
# before reloading to avoid reloading three times in a row.

set -u

WATCH_DIRS=(
    "/var/lib/cdn/lego/certificates"
    "/var/lib/cdn/nginx-generated"
)
DEBOUNCE_SECONDS="${RELOAD_DEBOUNCE_SECONDS:-5}"

echo "[cert-reload-watcher] watching ${WATCH_DIRS[*]} (debounce ${DEBOUNCE_SECONDS}s)"

while true; do
    # Block until something changes. -e: events to listen on.
    inotifywait -q -e close_write -e moved_to -e create -e delete \
                "${WATCH_DIRS[@]}" >/dev/null 2>&1 \
        || { echo "[cert-reload-watcher] inotifywait failed, sleeping 10s"; sleep 10; continue; }

    # Coalesce subsequent events within the debounce window.
    while inotifywait -q -t "${DEBOUNCE_SECONDS}" \
                      -e close_write -e moved_to -e create -e delete \
                      "${WATCH_DIRS[@]}" >/dev/null 2>&1; do
        :
    done

    # nginx -t before reloading: a malformed fragment (e.g. partial
    # rsync, lsyncd interrupted mid-push) would otherwise kill nginx.
    if /usr/sbin/nginx -t 2>/dev/null; then
        echo "[cert-reload-watcher] config OK → reloading nginx"
        sudo /usr/sbin/nginx -s reload || echo "[cert-reload-watcher] reload failed"
    else
        echo "[cert-reload-watcher] nginx -t failed, skipping reload (will retry on next event)"
    fi
done
