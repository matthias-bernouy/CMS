# @bernouy/keycloak-client

Thin typed wrapper around Keycloak's REST **admin** API. Two source
files: `KeycloakAdminClient.ts` (client + types) and
`KeycloakClientError.ts` (typed error). Everything is re-exported from
`src/index.ts`.

## What it covers

Just enough to provision a fresh tenant from the orchestrator
(`@bernouy/hub-api`):

| Method | Operation |
|---|---|
| `createRealm({ realm, displayName?, smtp? })` | new realm + optional SMTP config |
| `deleteRealm(realm)` | nuclear rollback (used mid-provision on failure) |
| `createConfidentialClient(realm, …)` | OIDC client for the CMS web app, returns `{ clientUuid, clientSecret }` |
| `createPublicClient(realm, …)` | OIDC client for the CLI (device flow by default) |
| `createRealmRole(realm, { name, description? })` | realm-scoped role |
| `createUser(realm, …)` | user with no password set, returns `userId` |
| `assignRealmRoleToUser(realm, userId, roleName)` | does the GET-role-by-name then POST role-mapping |
| `sendActionsEmail(realm, userId, actions, options?)` | magic link for `VERIFY_EMAIL` / `UPDATE_PASSWORD` / … |
| `getAccessToken()` | exposes the cached service-account JWT |

This is **strictly** the admin path — no end-user auth, no token
introspection. End-user flows live in `@bernouy/auth-keycloak`.

## Conventions

- **Strict CREATE semantics. No upsert.** Every `create*` throws
  `KeycloakClientError("conflict", …, 409)` if the resource already
  exists. The orchestrator decides whether to retry, skip, or roll back.
- **Idempotence belongs to the caller.** This client never reads-then-
  decides; it issues one request per method.
- **Token cache is built in.** `_getToken()` runs `client_credentials`
  against the configured service-account realm, caches the JWT, and
  refreshes 30 s before `expires_in`. `getAccessToken()` is exposed so
  the hub can pass the same token to other downstream services that
  trust this realm — don't re-implement the cache outside.
- **Error mapping table** lives in `assertOk` (401/403/404/409 →
  `unauthorized` / `forbidden` / `not_found` / `conflict`; other 4xx →
  `validation_error`; the rest → `unknown`). If you add a code, update
  both `KeycloakClientErrorCode` and the mapping at once.
- **`Location` parsing** is the only way to recover the new resource
  ID after a `POST` (Keycloak doesn't echo the body). If the header is
  missing → `KeycloakClientError("unknown", …)`. Keep
  `extractIdFromLocation` as the single chokepoint.
- **SMTP wire shape is flat string-typed** (`port: "587"`, `auth: "true"`).
  `mapSmtp` enforces this — never inline the conversion in `createRealm`.
- **`baseUrl`** is normalized at construction (`replace(/\/+$/, "")`):
  pass it without trailing slash and **without** `/admin` (the client
  prepends `/admin` to every path it builds).
- **`fetch` is injectable** via `config.fetch` — the test file uses it
  to swap in a fake. Always go through `this._fetch`, not `globalThis.fetch`.

## Public types worth knowing

- `KeycloakAdminAuth` — only `client-credentials` is supported today.
  The `realm` field is the realm hosting the service account
  (typically `master` with `create-realm` + `realm-management/*` perms).
- `ConfidentialClientInput` — `postLogoutRedirectUris` are joined with
  `##` into the Keycloak attribute `post.logout.redirect.uris`. Don't
  sort or dedupe; the order is meaningful to Keycloak.
- `PublicClientInput.oauth2DeviceAuthorizationGrantEnabled` defaults to
  `true` (CLI device flow).
- `KeycloakUserAction` covers what we actually call
  (`VERIFY_EMAIL`, `UPDATE_PASSWORD`, `CONFIGURE_TOTP`, `UPDATE_PROFILE`,
  `terms_and_conditions`). Add to the union, not as a string literal at
  the call site.

## Testing

`tests/KeycloakAdminClient.test.ts` covers the wire shape against a
mocked `fetch`. Use the same pattern when adding methods — don't spin
up a real Keycloak in unit tests.

## Dependencies

None at runtime. No Keycloak SDK. Browser-safe.
