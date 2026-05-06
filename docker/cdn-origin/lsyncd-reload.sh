#!/bin/bash
# Trigger an lsyncd restart so it re-reads the config file. The
# supervisor wrapper (lsyncd-supervisor.sh) catches the exit and
# respawns lsyncd. Best-effort: if no lsyncd is running, this is a no-op.

set -u

# `pkill -f` matches against the full command line; the supervisor
# launches lsyncd with `-nodaemon -log Exec /path/to/conf.lua`, so a
# match on `lsyncd -nodaemon` is unique.
pkill -TERM -f "lsyncd -nodaemon" || true
exit 0
