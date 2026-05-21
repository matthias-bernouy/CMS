#!/bin/bash
# hub entrypoint :
#   1. Validate env (populated by okms-fetch from the OKMS bundle).
#   2. Volume layout — /var/lib/hub/keys.
#   3. Copy OKMS mTLS cert/key to a tmpfs path the unprivileged `hub`
#      user can read (bun's OvhOkmsKekProvider needs them to unwrap the
#      hub-issuer signing keys).
#   4. exec bun. TLS termination is the sibling `nginx-proxy` container's
#      job — this process speaks plain HTTP on :3000.

set -e

: "${MAIN_DOMAIN:?MAIN_DOMAIN is required (e.g. hub.example.com)}"

# Keycloak is used ONLY to authenticate the /admin superadmins. The hub
# no longer manages tenant realms, so there's no admin service-account and
# no SMTP config.
: "${KEYCLOAK_BASE_URL:?KEYCLOAK_BASE_URL is required}"
: "${HUB_KEYCLOAK_CLIENT_ID:?HUB_KEYCLOAK_CLIENT_ID is required (OIDC client for the /admin browser session)}"
: "${HUB_KEYCLOAK_CLIENT_SECRET:?HUB_KEYCLOAK_CLIENT_SECRET is required}"
: "${HUB_SESSION_SECRET:?HUB_SESSION_SECRET is required (>=32 random chars)}"

# KEK: in prod the OvhOkmsKekProvider needs HUB_KEK_KEY_ID + OKMS cert/key.
# In dev (HUB_LOCAL_KEK_B64 set) the bun app uses LocalKekProvider — no
# OKMS round-trip, no cert mount.
#
# Catch the silent-misconfig case: OKMS_SKIP=1 without a LocalKekProvider
# would otherwise crash late in server.ts trying to read OKMS_REGION.
if [ "${OKMS_SKIP:-0}" = "1" ] && [ -z "${HUB_LOCAL_KEK_B64:-}" ]; then
    echo "[hub] FATAL: OKMS_SKIP=1 requires HUB_LOCAL_KEK_B64 (otherwise the bun app would still try to talk to OKMS)." >&2
    exit 1
fi
if [ -z "${HUB_LOCAL_KEK_B64:-}" ]; then
    : "${HUB_KEK_KEY_ID:?HUB_KEK_KEY_ID is required (OVH OKMS service-key UUID that wraps the hub-issuer signing keys)}"
fi

DATA=/var/lib/hub
mkdir -p "$DATA/keys"
chown -R hub:hub "$DATA"
# Defense in depth — keys are KEK-wrapped, but lock down disk perms too.
chmod 0700 "$DATA" "$DATA/keys"
if [ -f "$DATA/keys/keys.json" ]; then chmod 0600 "$DATA/keys/keys.json"; fi

# OKMS cert/key for the bun app's OvhOkmsKekProvider. `/etc/okms/*` is
# bind-mounted root:root with 0400 perms (enforced by okms-fetch) so the
# unprivileged `hub` user can't read it directly. Copy into a tmpfs
# location it can read, preserving tight perms.
# Dev mode (HUB_LOCAL_KEK_B64 set) skips this — no OKMS to talk to.
if [ -z "${HUB_LOCAL_KEK_B64:-}" ]; then
    mkdir -p /run/hub/okms
    cp "${OKMS_CERT_PATH:-/etc/okms/client.crt}" /run/hub/okms/client.crt
    cp "${OKMS_KEY_PATH:-/etc/okms/client.key}"  /run/hub/okms/client.key
    chown -R hub:hub /run/hub/okms
    chmod 0444 /run/hub/okms/client.crt
    chmod 0400 /run/hub/okms/client.key
    export OKMS_CERT_PATH=/run/hub/okms/client.crt
    export OKMS_KEY_PATH=/run/hub/okms/client.key
else
    echo "[hub] HUB_LOCAL_KEK_B64 set — using LocalKekProvider (dev mode, no OKMS)."
fi

# Hub issuer keystore lives on the persistent volume.
export HUB_KEY_STORE_PATH="${HUB_KEY_STORE_PATH:-$DATA/keys/keys.json}"

echo "[hub] Starting bun on :3000…"
exec su -s /bin/bash hub -c "bun run /app/server.ts"
