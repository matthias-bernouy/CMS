#!/bin/bash
# Wrap lsyncd in a respawn loop. The app reloads lsyncd by SIGTERM-ing
# the process; this loop catches the exit and restarts it with whatever
# config is on disk. When the edge list is empty, lsyncd has no
# `sync {}` blocks and refuses to start — we sleep and retry instead of
# spinning, so the origin can boot with zero edges configured.

set -u

CONFIG="${LSYNCD_CONFIG_PATH:-/etc/lsyncd/lsyncd.conf.lua}"

while true; do
    if [ ! -f "$CONFIG" ]; then
        echo "[lsyncd-supervisor] no config at $CONFIG yet — sleeping 10s"
        sleep 10
        continue
    fi
    # `nodaemon` is also set inside the generated config; pass it on the
    # CLI as well so a hand-crafted config without it still runs in fg.
    if grep -q '^sync {' "$CONFIG"; then
        echo "[lsyncd-supervisor] starting lsyncd with $CONFIG"
        lsyncd -nodaemon -log Exec "$CONFIG" || true
        echo "[lsyncd-supervisor] lsyncd exited — restarting in 2s"
        sleep 2
    else
        echo "[lsyncd-supervisor] no sync targets in $CONFIG — sleeping 10s"
        sleep 10
    fi
done
