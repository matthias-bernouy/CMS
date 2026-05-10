# @bernouy/mt-cms-control

Multi-tenant wrapper around `@bernouy/cms`'s single-tenant
`ControlCms`. Holds a tenant **registry** (Mongo) and a tenant
**runtime** (per-tenant routes mounted on the shared runner). Adding a
tenant via the superadmin UI or API mounts it immediately — no restart.

Package name on disk: `cms-control-mt/`. Published as
`@bernouy/mt-cms-control`.

## Layout

```
src/
├── exports/
│   ├── MtControlCms.ts        composition root: init/addTenant/removeTenant + Map<id, MountedTenant>
│   └── MtControlClient.ts     typed HTTP client for /superadmin/api/* (used by hub-api)
├── core/
│   ├── tenant/
│   │   ├── mountTenant.ts     wires KeycloakConsumer + KeycloakBearerConsumer + StorageTokenBroker + StorageBrowser + ControlCms onto /cms/<id>/
│   │   ├── unmountTenant.ts   runner.removeRoutesByPathPrefix(/cms/<id>)
│   │   └── purgeTenantData.ts drops Mongo collections matching `tenant_<id>__*`
│   ├── superadmin/
│   │   ├── mountSuperadminSurface.ts  /superadmin (HTML + assets) + /superadmin/api (file-routed)
│   │   └── createSuperadminGuard.ts
│   └── validation/
│       └── tenant/{id,parseCreateDto}.ts
├── api/
│   └── superadmin/            tenants.{get,post,patch,delete}.ts — file-routed REST
├── interfaces/
│   ├── Tenant.ts              { id, name, keycloak, assetsCdn, delivery? }
│   └── TenantRepository.ts
├── default-implementation/
│   └── MongoTenantRepository.ts
├── static/
│   └── superadmin/index.html  superadmin dashboard body (chrome added by mountSuperadminSurface)
└── index.ts
```

## What `MtControlCms.init()` does

```
1. mountSuperadminSurface(this)
     → /superadmin/             tenant dashboard HTML
     → /superadmin/assets/*     control bundle (vendored from @bernouy/cms's dist)
     → /superadmin/api/*        file-routed CRUD on the tenant registry
   All gated by createSuperadminGuard(superadminAuth).

2. tenantRepo.list() → for each → _mount(tenant)
     → KeycloakConsumer<TenantRole>(runner, tenant.keycloak)
     → KeycloakBearerConsumer<TenantRole>(tenant.keycloak)
     → CompositeAuthentication(bearer first, cookie second)
     → StorageTokenBroker(/cms/<id>/_storage, tenant.assetsCdn.bucketCredential)
     → StorageBrowser hydrated from broker.getBucketInfo()
     → BucketProxyPublisher (uses bucketCredential, not a service-account JWT)
     → ControlCms mounted under /cms/<id>
```

After `init()`, every tenant's CMS Control is reachable at
`<appBaseUrl>/cms/<tenantId>/admin`. New tenants added at runtime via
`addTenant(dto)` go through the same `_mount` path and become reachable
without restart.

## Two surfaces, two auth chains

| Surface | Mount | Auth |
|---|---|---|
| **Superadmin** | `/superadmin/*` | `superadminAuth` injected at construction. Typically a `CompositeAuthentication` of a superadmin Keycloak cookie + bearer JWT (the bearer leg accepts service-account tokens from `hub-api`). Role: `superadmin`. |
| **Per-tenant CMS** | `/cms/<id>/*` | tenant-scoped `CompositeAuthentication` (`KeycloakBearerConsumer` + `KeycloakConsumer` against `tenant.keycloak.issuer`). Role: `admin` for the tenant's CMS UI; mapped from the realm role named `tenant.keycloak.adminRole`. |

The superadmin chain is **distinct** from any tenant's chain — a
tenant admin never gains superadmin powers, and a superadmin doesn't
sneak into a tenant's CMS just by holding the superadmin session.
Cross-tenant isolation lives at this layer.

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
  keycloak:  { issuer, clientId, clientSecret, sessionSecret, adminRole, cliClientId? },
  assetsCdn: { url, bucketCredential },
  delivery?: { publicCdn, alias?, enabled?, dirtyAt? } }
```

- **`id` is the slug**, the URL prefix, and the Mongo collection
  prefix. URL-safe, never editable.
- **`keycloak` and `assetsCdn` are NOT patchable** — `MtControlClient`
  exposes no patch for them. Rotating any of those values requires
  delete + recreate so the runtime mount stays consistent with what's
  in the registry.
- **`delivery` IS patchable** via `updateTenantDelivery(id, …)` — used
  to enable delivery after DNS cutover.
- **`delivery.dirtyAt`** is set by Control admin actions (page save,
  bloc deploy) so the Delivery cron knows the tenant has changes to
  flush. Cleared by `cms-delivery-mt` once a build covers `>= dirtyAt`.

## `MtControlClient`

Typed HTTP client for `/superadmin/api/*`. Auth = bearer JWT.
Consumed by `@bernouy/hub-api` to provision/deprovision tenants. Every
response types `Date` as ISO `string` — parse on the caller side if
you need a `Date`.

The client and the server share the `Tenant` types via `interfaces/`
(re-exported from `index.ts`), so wire changes are caught at compile.

## Conventions

- **Path resolution via `import.meta.url` + relative dirname**.
  `mountSuperadminSurface` derives `PKG_ROOT` from
  `dirname(dirname(dirname(here)))` (4 levels up from
  `core/superadmin/`). Same rule as cdn-buckets / cdn-node — never
  `__dirname`. The two `node_modules/...` paths used to load the
  vendored cms bundle are also relative to `PKG_ROOT`.
- **Adding a tenant is `addTenant(dto)`** — never write to the repo
  directly and skip the runtime mount. The `try/catch` rolls back the
  DB write if mounting throws.
- **Removing a tenant is `removeTenant(id)`**: unmount → purgeData →
  delete row. The order matters — keep it.
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
