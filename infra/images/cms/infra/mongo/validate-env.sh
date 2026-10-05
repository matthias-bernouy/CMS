#!/bin/sh

# Validate credentials before the official entrypoint creates the root user.
# Without this preflight, a malformed application secret would fail only after
# MongoDB had already made the data volume non-empty, preventing an automatic
# retry of the initialization scripts.

set -eu

fail() {
    printf 'MongoDB configuration error: %s\n' "$1" >&2
    exit 64
}

validate_username() {
    validation_name="$1"
    validation_value="$2"

    [ -n "$validation_value" ] || fail "$validation_name must be set"
    case "$validation_value" in
        *[!A-Za-z0-9_-]*)
            fail "$validation_name must contain only letters, numbers, underscores, or hyphens"
            ;;
    esac
}

validate_hex_secret() {
    validation_name="$1"
    validation_value="$2"

    [ "${#validation_value}" -eq 64 ] \
        || fail "$validation_name must be a 64-character hexadecimal secret"
    case "$validation_value" in
        *[!A-Fa-f0-9]*)
            fail "$validation_name must be a 64-character hexadecimal secret"
            ;;
    esac
}

root_username="${MONGO_INITDB_ROOT_USERNAME:-}"
root_password="${MONGO_INITDB_ROOT_PASSWORD:-}"
validate_username MONGO_INITDB_ROOT_USERNAME "$root_username"
validate_hex_secret MONGO_INITDB_ROOT_PASSWORD "$root_password"

exec /usr/local/bin/docker-entrypoint.sh "$@"
