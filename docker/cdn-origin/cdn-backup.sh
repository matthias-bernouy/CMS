#!/bin/bash
# cdn-backup.sh — point-in-time backup of the cdn-origin container.
#
# 1. mongodump (gzipped archive) → /var/lib/cdn/backups/mongo-<DATE>.archive.gz
# 2. tar of /var/lib/cdn/buckets   → /var/lib/cdn/backups/buckets-<DATE>.tar.gz
# 3. Optional off-site copy via rclone if BACKUP_RCLONE_REMOTE is set.
# 4. Local rotation (BACKUP_LOCAL_RETENTION_DAYS, default 7).
# 5. Off-site rotation (BACKUP_OFFSITE_RETENTION_DAYS, default 30).
#
# Triggered by the daily loop in entrypoint.sh, or manually via:
#     docker exec cdn-origin /usr/local/bin/cdn-backup.sh
#
# Note: edges already have a copy of /var/lib/cdn/buckets so the tar is
# partly redundant, but it captures the origin's authoritative state at
# a single point in time which the lsyncd-replicated copy does not.

set -euo pipefail

DATA=/var/lib/cdn
BACKUP_DIR="${DATA}/backups"
LOCAL_RETENTION_DAYS="${BACKUP_LOCAL_RETENTION_DAYS:-7}"
OFFSITE_RETENTION_DAYS="${BACKUP_OFFSITE_RETENTION_DAYS:-30}"
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
RCLONE_CONFIG="${BACKUP_RCLONE_CONFIG_PATH:-/etc/cdn/rclone.conf}"

DATE=$(date -u +%Y%m%d-%H%M%S)
MONGO_FILE="mongo-${DATE}.archive.gz"
BUCKETS_FILE="buckets-${DATE}.tar.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] ${DATE} starting…"

if [ "${BACKUP_SKIP_MONGO:-false}" != "true" ]; then
    : "${MONGO_URL:?MONGO_URL is required to run mongodump (set BACKUP_SKIP_MONGO=true to skip).}"
    MONGO_DB_NAME=${MONGO_DB_NAME:-cdn}
    echo "[backup] mongodump (db=${MONGO_DB_NAME}) → ${MONGO_FILE}"
    mongodump --quiet --gzip --archive="${BACKUP_DIR}/${MONGO_FILE}" --uri="${MONGO_URL}" --db="${MONGO_DB_NAME}"
else
    echo "[backup] mongodump skipped (BACKUP_SKIP_MONGO=true)"
fi

echo "[backup] tar buckets → ${BUCKETS_FILE}"
tar -C "${DATA}" -czf "${BACKUP_DIR}/${BUCKETS_FILE}" buckets

if [ -n "${RCLONE_REMOTE}" ]; then
    if [ ! -f "${RCLONE_CONFIG}" ]; then
        echo "[backup] WARN: BACKUP_RCLONE_REMOTE set but ${RCLONE_CONFIG} missing — skipping off-site"
    else
        echo "[backup] off-site: rclone copy → ${RCLONE_REMOTE}"
        rclone --config "${RCLONE_CONFIG}" copy "${BACKUP_DIR}/${MONGO_FILE}"   "${RCLONE_REMOTE}/"
        rclone --config "${RCLONE_CONFIG}" copy "${BACKUP_DIR}/${BUCKETS_FILE}" "${RCLONE_REMOTE}/"
    fi
fi

echo "[backup] pruning local backups older than ${LOCAL_RETENTION_DAYS}d"
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'mongo-*.archive.gz' -mtime "+${LOCAL_RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'buckets-*.tar.gz'   -mtime "+${LOCAL_RETENTION_DAYS}" -delete

if [ -n "${RCLONE_REMOTE}" ] && [ -f "${RCLONE_CONFIG}" ]; then
    echo "[backup] pruning off-site backups older than ${OFFSITE_RETENTION_DAYS}d"
    rclone --config "${RCLONE_CONFIG}" delete "${RCLONE_REMOTE}/" --min-age "${OFFSITE_RETENTION_DAYS}d" || true
fi

echo "[backup] ${DATE} done."
