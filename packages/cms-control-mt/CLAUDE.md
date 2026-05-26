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
connector wired at the composition root (`docker/cms-tp`). The Mongo
registry is a hub-fed runtime store, not an independent control plane.

Package name on disk: `cms-control-mt/`. Published as
`@bernouy/mt-cms-control`.

## Layout

```
src/
├── exports/
│   └── MtControlCms.ts        composition root: init/provisionTenant/reprovisionTenant/deprovisionTenant + Map<id, MountedTenant>
├── core/
│   ├── tenant/
│   │   ├── mountTenant.ts     wires Keycloak cookie+bearer (authN) + member-based authZ + StorageTokenBroker + StorageBrowser + ControlCms onto /cms/<id>/
│   │   ├── members.ts         per-tenant CMS-admin membership (authZ lives in the CMS): seedAdmin + loadAdminEmails
│   │   ├── unmountTenant.ts   runner.removeRoutesByPathPrefix(/cms/<id>)
│   │   └── purgeTenantData.ts drops Mongo collections matching `tenant_<id>__*`
├── interfaces/
│   ├── Tenant.ts              { id, name, keycloak, assetsCdn, delivery? }
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
  → KeycloakConsumer<TenantRole>(runner, tenant.keycloak)
  → KeycloakBearerConsumer<TenantRole>(tenant.keycloak)
  → CompositeAuthentication(bearer first, cookie second)
  → StorageTokenBroker(/cms/<id>/_storage, tenant.assetsCdn.bucketCredential)
  → StorageBrowser hydrated from broker.getBucketInfo()
  → BucketProxyPublisher (uses bucketCredential, not a service-account JWT)
  → ControlCms mounted under /cms/<id>
```

After `init()`, every tenant's CMS Control is reachable at
`<appBaseUrl>/cms/<tenantId>/` (admin pages under `/admin/*`). New
tenants provisioned at runtime via `provisionTenant(input)` go through
the same `_mount` path and become reachable without restart.

## Per-tenant auth chain

Each tenant's CMS mounts under `/cms/<id>/*` behind a
`CompositeAuthentication` (`KeycloakBearerConsumer` + `KeycloakConsumer`).
Keycloak is **authentication only** — typically a **shared realm + shared
client** across all tenants (no per-tenant Keycloak object).

**Authorization lives in the CMS**: `mountTenant` loads the tenant's
admin emails (`loadAdminEmails`) into a set and `claimsToSubject` (sync)
grants `admin` iff the token's **verified email** is in it — else `user`.
The subject `identifier` stays the opaque `sub` (contract). Membership is
captured at mount; changes take effect on remount. The first admin is
seeded from `initialAdminEmail` at provision.

## Tenant data layout

Each tenant's CMS data lives in Mongo collections prefixed
`tenant_<id>__`:

```
tenant_<id>__pages
tenant_<id>__blocs
tenant_<id>__templates
tenant_<id>__snippets
tenant_<id>__system
tenant_<id>__secrets        (encrypted via EnvelopeSecretCrypto)
```

`MongoCmsRepository` is instantiated with `{ collectionPrefix:
"tenant_<id>__" }`. `purgeTenantData(db, id)` drops the five model
collections (best-effort — missing collections are skipped). Note: the
**`__secrets` collection is NOT in `purgeTenantData`'s list today** —
double-check before relying on a clean wipe.

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

## `Tenant` model — what's patchable, what isn't

`Tenant` (in `interfaces/Tenant.ts`):

```
{ id, name, createdAt, updatedAt,
  keycloak:  { issuer, clientId, clientSecret, sessionSecret, cliClientId? },
  assetsCdn: { url, bucketCredential },
  delivery?: { publicCdn, alias?, enabled?, dirtyAt? } }
```

- **`id` is the slug**, the URL prefix, and the Mongo collection
  prefix. URL-safe, never editable.
- **`keycloak` and `assetsCdn` are NOT patchable** — rotating any of
  those values requires delete + recreate so the runtime mount stays
  consistent with what's in the registry.
- **`delivery` IS patchable** via `updateTenantDelivery(id, …)` — used
  to enable delivery after DNS cutover.
- **`delivery.dirtyAt`** is set by Control admin actions (page save,
  bloc deploy) so the Delivery cron knows the tenant has changes to
  flush. Cleared by `cms-delivery-mt` once a build covers `>= dirtyAt`.

## Conventions

- **Provisioning a tenant is `provisionTenant(input)`** (idempotent:
  already-mounted → no-op) — never write to the repo directly and skip
  the runtime mount. The `try/catch` rolls back the DB write if mounting
  throws. `reprovisionTenant` re-mounts after an OIDC change (preserves
  the `sessionSecret`).
- **Deprovisioning is `deprovisionTenant(id, { force })`**: unmount →
  (force only) purgeData → delete row. Non-force keeps the CMS data.
- **No per-tenant `runner.start()`.** All tenants share the runner the
  consumer started before calling `init()`. `runner.group(prefix)` +
  `removeRoutesByPathPrefix(prefix)` is what makes the dynamic
  mount/unmount work.
- **The cookie name is per-tenant** (`cms-<id>-session`) so a single
  browser can be logged into multiple tenants on the same host.
- **`bearerAuth` comes first in the composite** — short-circuits cookie
  lookup for service-account API calls (e.g. the hub).
- **`StorageBrowser` is built once at mount** from a single
  `broker.getBucketInfo()` call; the bucket info is treated as
  immutable for the lifetime of the mount. If the bucket settings
  change, unmount + remount.

## Dependencies

- runtime: `@bernouy/core`, `@bernouy/runner-bun`, `@bernouy/auth-keycloak`,
  `@bernouy/auth-composite`, `@bernouy/cdn-buckets`, `@bernouy/cms`
- peer: `mongodb`, `typescript`
