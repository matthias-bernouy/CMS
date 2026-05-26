#!/bin/sh
# ⚠️  DEV ONLY — invoked exclusively from `compose.dev.yml`. Never reference
# from a production compose file. Inline secrets (admin/admin, hardcoded
# client secret) are intentional for local-only use.
#
# One-shot Keycloak setup for the dev stack. Post-pivot the hub no longer
# manages tenants — it only needs Keycloak to authenticate superadmins on
# /admin/*. So this creates exactly:
#   - the `hub-admin` OIDC client (browser cookie session)
#   - the `superadmin` realm role
#   - the `dev@local / dev` user with that role
#
# NO `hub-orchestrator` service account anymore (the hub never calls the
# Keycloak admin API). Re-runnable / idempotent.

set -eu

apk add --no-cache curl jq >/dev/null

KC=http://keycloak:8080
REALM=master
ADMIN_ID=hub-admin
ADMIN_SECRET=dev-admin-secret
USER_EMAIL=dev@local
USER_PASSWORD=dev
SUPERADMIN_ROLE=superadmin

log() { printf "[kc-setup] %s\n" "$*" >&2; }

# 1. Admin token (short retry in case realm endpoints lag the health probe).
log "fetching admin token from $KC…"
TOKEN=""
for i in $(seq 1 30); do
    TOKEN=$(curl -fsS -X POST \
        "$KC/realms/master/protocol/openid-connect/token" \
        -d grant_type=password -d client_id=admin-cli \
        -d username=admin -d password=admin 2>/dev/null | jq -r '.access_token // empty' || true)
    [ -n "$TOKEN" ] && break
    sleep 1
done
[ -z "$TOKEN" ] && { log "FATAL: could not obtain admin token after 30s"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

get_client_uuid() {
    curl -fsS -H "$AUTH" "$KC/admin/realms/$REALM/clients?clientId=$1" | jq -r '.[0].id // empty'
}

# 2. hub-admin (OIDC redirect-based for the /admin cookie session)
if [ -z "$(get_client_uuid $ADMIN_ID)" ]; then
    log "creating client $ADMIN_ID…"
    curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
        "$KC/admin/realms/$REALM/clients" \
        -d "{
            \"clientId\": \"$ADMIN_ID\",
            \"clientAuthenticatorType\": \"client-secret\",
            \"secret\": \"$ADMIN_SECRET\",
            \"enabled\": true,
            \"publicClient\": false,
            \"standardFlowEnabled\": true,
            \"directAccessGrantsEnabled\": false,
            \"redirectUris\": [\"http://hub.localtest.me:3000/admin/auth/*\"],
            \"webOrigins\": [\"http://hub.localtest.me:3000\"]
        }" >/dev/null
else
    log "client $ADMIN_ID already exists, skipping"
fi

# 2b. cms-admin — shared confidential client for tenant-admin login on cms-tp.
#     One realm + client for ALL tenants; the CMS authorizes per-tenant by
#     verified email. Redirect uses a SINGLE TRAILING wildcard `/cms/*` —
#     Keycloak only honors `*` at the end of the URI, so a mid-path pattern
#     like `/cms/*/auth/*` is rejected with "Invalid parameter: redirect_uri".
#     `/cms/*` covers every tenant's `/cms/<id>/auth/callback`.
CMS_ADMIN_ID=cms-admin
CMS_ADMIN_SECRET=dev-cms-admin-secret
if [ -z "$(get_client_uuid $CMS_ADMIN_ID)" ]; then
    log "creating client $CMS_ADMIN_ID…"
    curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
        "$KC/admin/realms/$REALM/clients" \
        -d "{
            \"clientId\": \"$CMS_ADMIN_ID\",
            \"clientAuthenticatorType\": \"client-secret\",
            \"secret\": \"$CMS_ADMIN_SECRET\",
            \"enabled\": true,
            \"publicClient\": false,
            \"standardFlowEnabled\": true,
            \"directAccessGrantsEnabled\": false,
            \"redirectUris\": [\"http://cms-tp.localtest.me:4012/cms/*\"],
            \"webOrigins\": [\"http://cms-tp.localtest.me:4012\"]
        }" >/dev/null
else
    log "client $CMS_ADMIN_ID already exists, skipping"
fi

# 3. superadmin realm role
if ! curl -fsS -o /dev/null -H "$AUTH" "$KC/admin/realms/$REALM/roles/$SUPERADMIN_ROLE"; then
    log "creating role $SUPERADMIN_ROLE…"
    curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
        "$KC/admin/realms/$REALM/roles" \
        -d "{\"name\": \"$SUPERADMIN_ROLE\"}" >/dev/null
else
    log "role $SUPERADMIN_ROLE already exists, skipping"
fi

# 4. dev@local user
USER_ID=$(curl -fsS -H "$AUTH" \
    "$KC/admin/realms/$REALM/users?email=$USER_EMAIL" | jq -r '.[0].id // empty')
if [ -z "$USER_ID" ]; then
    log "creating user $USER_EMAIL…"
    curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
        "$KC/admin/realms/$REALM/users" \
        -d "{
            \"username\": \"$USER_EMAIL\",
            \"email\": \"$USER_EMAIL\",
            \"emailVerified\": true,
            \"enabled\": true,
            \"credentials\": [{\"type\":\"password\",\"value\":\"$USER_PASSWORD\",\"temporary\":false}]
        }" >/dev/null
    USER_ID=$(curl -fsS -H "$AUTH" \
        "$KC/admin/realms/$REALM/users?email=$USER_EMAIL" | jq -r '.[0].id')
else
    log "user $USER_EMAIL already exists, skipping"
fi

# 5. Assign superadmin to dev@local
SUPERADMIN_ROLE_JSON=$(curl -fsS -H "$AUTH" "$KC/admin/realms/$REALM/roles/$SUPERADMIN_ROLE")
curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
    "$KC/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
    -d "[$SUPERADMIN_ROLE_JSON]" >/dev/null 2>&1 || log "(superadmin already assigned)"

# 6. keycloak-tp service account — the Keycloak tenant-provisioner authenticates
#    with client_credentials to create/update/delete realms. DEV: granted the
#    master `admin` role (full admin). Prod would scope this to `create-realm`
#    + realm-management and pull the secret from OKMS, never inline.
TP_CLIENT_ID=keycloak-tp
TP_CLIENT_SECRET=dev-keycloak-tp-secret
if [ -z "$(get_client_uuid $TP_CLIENT_ID)" ]; then
    log "creating service-account client $TP_CLIENT_ID…"
    curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
        "$KC/admin/realms/$REALM/clients" \
        -d "{
            \"clientId\": \"$TP_CLIENT_ID\",
            \"clientAuthenticatorType\": \"client-secret\",
            \"secret\": \"$TP_CLIENT_SECRET\",
            \"enabled\": true,
            \"publicClient\": false,
            \"serviceAccountsEnabled\": true,
            \"standardFlowEnabled\": false,
            \"directAccessGrantsEnabled\": false
        }" >/dev/null
else
    log "client $TP_CLIENT_ID already exists, skipping"
fi
TP_UUID=$(get_client_uuid $TP_CLIENT_ID)
TP_SA_USER=$(curl -fsS -H "$AUTH" "$KC/admin/realms/$REALM/clients/$TP_UUID/service-account-user" | jq -r '.id')
ADMIN_ROLE_JSON=$(curl -fsS -H "$AUTH" "$KC/admin/realms/$REALM/roles/admin")
curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
    "$KC/admin/realms/$REALM/users/$TP_SA_USER/role-mappings/realm" \
    -d "[$ADMIN_ROLE_JSON]" >/dev/null 2>&1 || log "(admin role already assigned to $TP_CLIENT_ID)"

log "✅ done — login as $USER_EMAIL / $USER_PASSWORD at http://hub.localtest.me:3000/admin/"
