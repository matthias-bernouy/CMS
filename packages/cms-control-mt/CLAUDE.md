# @bernouy/mt-cms-control

Multi-tenant wrapper around `@bernouy/cms`'s single-tenant
`ControlCms`. Holds a tenant **registry** (Mongo) and a tenant
**runtime** (per-tenant routes mounted on the shared runner).
`provisionTenant` mounts a tenant immediately — no restart.

**Provisioning is hub-driven.** There is no in-process superadmin
surface. The `cms-control` tenant-provisioner (see
`official-tenant-provisioners/cms-control`) receives the hub's
`/admin/tenants` calls and drives
`provisionTenant`/`reprovisionTenant`/`deprovisionTenant` here via a
connector wired at the consumer's composition root. The Mongo
registry is a hub-fed runtime store, not an independent control plane.

Package name on disk: `cms-control-mt/`. Published as
`@bernouy/mt-cms-control`.

## Layout

```
src/
├── exports/
│   └── MtControlCms.ts        composition root: init / provisionTenant / reprovisionTenant / deprovisionTenant + Map<id, MountedTenant>; private _seedAuth seeds the local admin
├── core/
│   ├── tenant/
│   │   ├── mountTenant.ts     wires CMS-owned auth (LocalAuthentication + OidcAuthentication + SubjectResolver + signed session cookie) + per-tenant repos (users, identityProviders, credentials, pats, rate-limiter) + files backend (Mongo metadata + S3/FS blob) + ControlCms onto /cms/<id>/
│   │   ├── seedTenantAuth.ts  idempotent bootstrap of the builtin `local` provider + admin credential + `admin` role in UsersRepository
│   │   ├── members.ts         LEGACY — `seedAdmin`/`loadAdminEmails` over a `members` collection; no longer read by the auth chain (authZ moved to UsersRepository). Still written for now; slated for deletion
│   │   ├── unmountTenant.ts   runner.removeRoutesByPathPrefix(/cms/<id>)
│   │   └── purgeTenantData.ts drops a SUBSET of `tenant_<id>__*` collections — see "Tenant data layout" below for the gap
├── interfaces/
│   ├── Tenant.ts              { id, name, createdAt, updatedAt, delivery? }
│   └── TenantRepository.ts
├── default-implementation/
│   └── MongoTenantRepository.ts
└── index.ts
```

## What `MtControlCms.init()` does

Boot-mounts every tenant already in the registry (the hub does NOT
re-run `onProvision` after a restart, so this is what brings existing
tenants back online):

```
tenantRepo.list() → for each → _mount(tenant)
  → per-tenant Mongo repos (CmsRepository, UsersRepository, IdentityProviderRepository,
    LocalCredentialStore, PatRepository, RateLimiter, FilesMetadata)
  → per-tenant blob backend (S3 if CMS_S3_BUCKET else local FS, prefixed `tenant_<id>/`)
  → per-tenant EncryptedMongoSecretStore (scopeId = tenant.id, DEK in shared cms_deks)
  → per-tenant PiiCrypto (HMAC index key in `tenant_<id>__system_keys`, encrypted with the DEK)
  → SignedCookieCodec(session.sessionSecret) + SubjectResolver<TenantRole>(users, "user")
  → LocalAuthentication (builtin `local` provider, basePath /auth, cookie `cms-<id>-session`)
  → OidcAuthentication (dynamic — serves every configured redirect provider in `identityProviders`)
  → ControlCms mounted under /cms/<id>
```

After `init()`, every tenant's CMS Control is reachable at
`<appBaseUrl>/cms/<tenantId>/` (admin pages under `/admin/*`). New
tenants provisioned at runtime via `provisionTenant(input)` go through
the same `_mount` path AND a `_seedAuth(input)` step, both behind the
provision try/catch.

`init()` itself does NOT re-seed — that runs only at `provisionTenant`
/ `reprovisionTenant`. An existing tenant restarting keeps whatever
admin credentials are in its `credentials` collection.

## Per-tenant auth chain (CMS-owned)

Each tenant's CMS mounts under `/cms/<id>/*`. Authentication is **CMS-owned**
end to end — no external IdP is required by default:

- **`LocalAuthentication`** (builtin `local` provider) — email/password form
  served at `/cms/<id>/auth/login`, posts to `/auth/login`. argon2 hashing
  via `LocalCredentialStore`. Bound to the membership store (`UsersRepository`)
  through `SubjectResolver`. PAT verification (CLI / server-to-server) also
  lives here: a presented `Authorization: Bearer pat_…` is verified against
  the per-tenant `PatRepository` before cookie lookup.
- **`OidcAuthentication`** (dynamic) — one backend that consults the per-tenant
  `IdentityProviderRepository` at request time. Each enabled OIDC provider
  exposes `/cms/<id>/auth/<providerId>/login` + `…/callback`. Adding /
  editing / enabling / disabling a provider through the admin UI takes
  effect **without remount**.
- **Signed session cookie** — `cms-<id>-session`, signed with the
  platform-shared `AdminSessionConfig.sessionSecret` via
  `@bernouy/core`'s `SignedCookieCodec`. Cookie name is per-tenant so a
  single browser can be logged into multiple tenants on the same host.
- **`SameSite=Lax`** + the `ControlCms` `authGuard` cross-origin check
  cover CSRF for mutating routes.

**Authorization lives in the CMS** via `UsersRepository.role` (`admin`
or `user`). The role NEVER comes from an OIDC claim — `SubjectResolver`
upserts every new identity at default `user`, and the `admin` role is
granted server-side only (initial admin seeded by `seedTenantAuth`,
others via `POST /api/users/role` from the admin UI). `authGuard` reads
the role from the store on every request and 403s anything below
`admin` on `/api/*`.

The Keycloak path is gone from this package — Keycloak survives only as
ONE possible OIDC provider a tenant can configure as data, not as the
platform's auth backend.

## Tenant data layout

Each tenant's CMS data lives in Mongo collections prefixed
`tenant_<id>__`:

```
# Content (CmsRepository)
tenant_<id>__pages
tenant_<id>__blocs
tenant_<id>__templates
tenant_<id>__snippets
tenant_<id>__system

# Files (CmsFilesMetadata; blob lives in S3 or local FS)
tenant_<id>__filesMeta

# Secrets (EncryptedMongoSecretStore, scopeId = tenant.id)
tenant_<id>__secrets

# Auth (CMS-owned)
tenant_<id>__users               UsersRepository — PII (email, displayName) encrypted at rest
tenant_<id>__identityProviders   IdentityProviderRepository (config only; clientSecret ref points to __secrets)
tenant_<id>__credentials         LocalCredentialStore — argon2 hash + encrypted email
tenant_<id>__pats                PatRepository — sha256(pat_…)
tenant_<id>__rate_limits         MongoRateLimiter — login brute-force throttle (TTL-backed)
tenant_<id>__system_keys         PiiCrypto blind-index key (HMAC) — encrypted via the tenant DEK

# Legacy (no readers — slated for deletion)
tenant_<id>__members             written by `seedAdmin`, never queried by the auth chain
```

`MongoCmsRepository` is instantiated with `{ collectionPrefix:
"tenant_<id>__" }`; every other repo above takes the same prefix.

**`purgeTenantData(db, id)` only drops 5 collections** (`pages`,
`blocs`, `templates`, `snippets`, `system`) — it does NOT drop
`secrets`, `users`, `credentials`, `pats`, `identityProviders`,
`rate_limits`, `system_keys`, `filesMeta`, or the legacy `members`. A
destructive deprovision today therefore leaves PII (encrypted but
non-zero), credential hashes, and the tenant's HMAC index key in
Mongo. To be fixed before relying on a clean wipe.

## Per-tenant secret store

Every tenant gets an `EncryptedMongoSecretStore` with
`scopeId = tenant.id`, backed by a single shared `cms_deks` collection:

- The same `SecretCrypto` instance (passed in by the consumer) handles
  every tenant. DEKs isolate by `scopeId`, so cross-tenant decryption
  is structurally impossible.
- The KEK is platform-wide. Compromising one tenant's DEK does not
  reveal other tenants' DEKs (the KEK has to unwrap each one).
- Production wires `OvhOkmsKekProvider` so the KEK lives in OVH OKMS
  (Customer Managed Key, never reachable in-process).

`tenant_<id>__secrets` documents have shape `EncryptedSecretDocument`
(re-exported from `@bernouy/cms`). Reads/writes go through the
`EncryptedMongoSecretStore` instance the tenant gets at mount time.

PII protection (user emails/displayNames in `users`, credential email
in `credentials`) re-uses the same DEK through `PiiCrypto`. The
deterministic `blindIndex` HMAC key (per tenant) lives encrypted in
`__system_keys` — exact-match lookups on encrypted fields are possible,
substring search and sort are not.

## `Tenant` model — what's patchable, what isn't

`Tenant` (in `interfaces/Tenant.ts`):

```
{ id, name, createdAt, updatedAt,
  delivery?: { alias?, enabled?, dirtyAt? } }
```

- **`id` is the slug**, the URL prefix, and the Mongo collection
  prefix. URL-safe, never editable.
- No `keycloak` / `auth` config lives on the tenant row — auth is
  CMS-owned (builtin local provider + per-tenant dynamic OIDC
  providers stored in `__identityProviders`). The shared
  `AdminSessionConfig.sessionSecret` is platform-level on
  `MtControlCmsDeps`, not per-tenant.
- **`name` is patchable** via `reprovisionTenant` (the hub PATCHes the
  tenant config; the runtime updates the row + re-mounts).
- **`delivery` IS patchable** via `updateTenantDelivery(id, …)` — used
  to enable delivery after DNS cutover.
- **`delivery.dirtyAt`** is set by Control admin actions (page save,
  bloc deploy) so a Delivery cron knows the tenant has changes to
  flush.

## Conventions

- **Provisioning a tenant is `provisionTenant(input)`** (idempotent:
  already-mounted → no-op) — never write to the repo directly and skip
  the runtime mount. The try/catch rolls back the DB write + drops the
  whole `/cms/<id>` route prefix if mounting throws. The seed step
  (`_seedAuth`) runs first; it is itself idempotent (`seedTenantAuth`
  skips existing admin emails — a retried provision never resets the
  password).
- **`reprovisionTenant` re-mounts** after a `providerConfig` change.
  Unmount → upsert the row → `_seedAuth(input)` (idempotent, won't
  rotate an existing admin's password — operators rotate from the
  admin UI) → mount.
- **Deprovisioning is `deprovisionTenant(id, { force })`**: unmount →
  (force only) purgeData → delete row. Non-force keeps the CMS data.
  See "Tenant data layout" — the purge is incomplete today.
- **No per-tenant `runner.start()`.** All tenants share the runner the
  consumer started before calling `init()`. `runner.group(prefix)` +
  `removeRoutesByPathPrefix(prefix)` is what makes the dynamic
  mount/unmount work.
- **The cookie name is per-tenant** (`cms-<id>-session`) so a single
  browser can be logged into multiple tenants on the same host. The
  signing key (`session.sessionSecret`) is shared across tenants —
  forgery across tenants is structurally blocked by the cookie name
  itself.
- **Files backend per tenant**: `MongoCmsFilesMetadata` (tree, prefixed
  `tenant_<id>__`) + a `CmsFilesBlobStore` (S3 when `CMS_S3_BUCKET` is set,
  keyed `tenant_<id>/`; else a local-FS dir). Media flows through the CMS's
  `/api/files` endpoints.
- **Bootstrap admin password logging is gated** by `NODE_ENV !==
  "production"` — a mis-wired prod TP that forgets to send
  `initialAdminPassword` will NOT leak the generated value to stdout.

## Dependencies

- runtime: `@bernouy/core`, `@bernouy/runner-bun`, `@bernouy/cms`
- peer: `mongodb`, `typescript`
