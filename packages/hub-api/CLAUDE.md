# @bernouy/hub-api

The orchestrator that provisions a tenant end-to-end across Keycloak +
`cms-control-mt` + `cdn-buckets`. Single public surface:
`POST /api/tenants` (provision), `DELETE /api/tenants` (deprovision),
`GET /api/preflight` (deep health check).

This package owns the **recipe** — what gets created, in what order,
how it rolls back. It owns no state of its own; everything lives on
the downstream services it composes.

## Layout

```
src/
├── exports/
│   ├── Hub.ts                 composition root: holds KeycloakAdminClient + per-op MtControlClient/BucketsClient
│   └── mountHubApi.ts         registers /health (public) + /api/* (gated by requireRole)
├── core/
│   ├── provisionTenant.ts     12-step recipe (Keycloak realm → clients → role → user → magic link → CDN buckets → CMS tenant)
│   ├── deprovisionTenant.ts   reverse-order best-effort cleanup
│   ├── checkInit.ts           preflight: end-to-end auth + role check across all three downstreams
│   ├── HubError.ts            { code, message, cause? } — wraps the downstream client error
│   └── schemas/               zod schemas for input/output + zod-to-openapi setup (used by scripts/generate-openapi.ts)
├── api/                       file-routed endpoints — `meta` export + default handler
│   ├── preflight.get.ts       GET /api/preflight
│   └── tenants/
│       ├── tenants.post.ts    POST /api/tenants — provision
│       └── tenants.delete.ts  DELETE /api/tenants — deprovision
├── interfaces/
│   └── HubConfig.ts           keycloak + cms + cdn URLs, SMTP, optional bucket defaults
├── constants.ts               hubApiPackageRoot
└── index.ts                   re-exports Hub, mountHubApi, HubError, HubConfig, ProvisionTenant{Input,Result}
```

## What `Hub` does (and doesn't)

`Hub` is a thin glue class:

- Constructs **once** a `KeycloakAdminClient` (which manages its own
  JWT cache + 30s-pre-expiry refresh).
- Builds **per-operation** `MtControlClient` and `BucketsClient`,
  passing them the JWT cached by the Keycloak admin client. Same JWT
  is accepted by `cms-control-mt` and `cdn-buckets` because they both
  validate it through `KeycloakBearerConsumer` against the same realm
  + service-account.
- Delegates `init()` / `provisionTenant()` / `deprovisionTenant()` to
  pure recipe functions in `core/`.

`Hub` does **not**:
- own state (no DB, no cache).
- expose its own auth — `mountHubApi` plugs in any `Authentication`
  (typically `KeycloakBearerConsumer` validating service-account
  callers in the `master` realm).
- know about HTTP — `mountHubApi` is the only HTTP-aware code.

## Provisioning recipe (12 steps)

`provisionTenant` runs in this order. Anything that throws triggers a
best-effort `deprovisionTenant` rollback before the original error
bubbles to the caller as `HubError("provision_failed", …)`:

1. **Keycloak realm** + SMTP config (so the welcome email works).
2. **Confidential OIDC client `cms`** for the CMS web app (returns the
   client secret).
3. **Public OIDC client `cms-cli`** with device-flow enabled, for the
   `p9r` CLI.
4. **Realm role `admin`**.
5–7. **First user** + `admin` role assignment + `execute-actions-email`
   for `UPDATE_PASSWORD` + `VERIFY_EMAIL` (lifespan default 7 days).
8–9. **CDN assets bucket** `<slug>-assets` + bucket credential.
10–11. **(Optional) CDN delivery bucket** `<slug>-delivery` + credential
   when `deliveryEnabled` or `publicAlias` is set.
12. **CMS tenant row** in `cms-control-mt` carrying the realm details +
   bucket URLs + freshly generated 32-byte session secret.

The session secret is generated per tenant via `crypto.getRandomValues`
inside `provisionTenant`; the consumer (CMS) HMAC-signs sessions with
it. Rotating it logs every existing user out of that tenant — that's
the intended escape hatch.

## Bucket defaults

Default bucket settings (applied to both buckets unless overridden):

```ts
cacheControl: "public, max-age=31536000, immutable"
quotas:       { maxTotalSize: 10 GiB, maxFileCount: 10000 }
limits:       { maxFileSize: 100 MiB, acceptedMimeTypes: "*" }
```

Overridable per-hub via `HubConfig.bucketDefaults`, and per-tenant via
`ProvisionTenantInput.bucketOverrides`. `mergeBucketDefaults` takes
care of the merge order — don't reach into either at the call site.

## Endpoint metadata + OpenAPI

Every file in `api/` exports a `meta: ApiOperationMeta` object alongside
the default handler. `scripts/generate-openapi.ts` walks `api/`, reads
each `meta`, and emits a checked-in `openapi.json` at the package root.
**The committed `openapi.json` IS the contract** — regenerate it
whenever you touch a meta or a schema (`bun run openapi`).

## `mountHubApi` — what it registers

```
GET    /health           public liveness (200 if process alive)
POST   /api/tenants      provisionTenant     (gated)
DELETE /api/tenants      deprovisionTenant   (gated)
GET    /api/preflight    Hub.init()          (gated)
```

- `/health` is intentionally public so a Docker `HEALTHCHECK` or LB
  probe doesn't need credentials.
- `/api/preflight` is the **deep** check — actually pings Keycloak,
  cms-control-mt, cdn-buckets with the cached JWT and verifies role
  acceptance. Reveals infra info, hence gated.
- Default `requiredRole = "superadmin"`. Override per-deployment.
- Default `csrf = "cookie-only"` — bearer requests pass through, cookie
  requests get the Origin/Referer same-origin check.

## `HubError`

Every public method of `Hub` throws `HubError({ code, message, cause? })`
on a controlled failure path. Codes:

| code | meaning | typical HTTP |
|---|---|---|
| `validation_error` | bad input (zod parse failed, slug clash) | 400 |
| `keycloak_unreachable` | downstream service down / auth failed | 502 (preflight 503) |
| `cms_unreachable` | … | 502 (preflight 503) |
| `cdn_unreachable` | … | 502 (preflight 503) |
| `provision_failed` | recipe threw + rollback ran (cause is the original error) | 502 |
| `deprovision_partial` | rollback couldn't clean everything (e.g. realm vanished mid-cleanup) | 500 |
| `unknown` | last-resort fallback | 500 |

The `cause` field carries the underlying client error
(`KeycloakClientError`, `BucketsClientError`, `MtControlClientError`)
so operators have something concrete to read in the logs.

## Conventions

- **Recipe in `core/`, glue in `exports/Hub.ts`, HTTP in
  `exports/mountHubApi.ts`** — keep the layers strict. Adding business
  logic to a handler (`api/...`) breaks the OpenAPI generator (it
  expects a thin shell around `Hub.*`).
- **Per-op clients, not class-level.** `_cmsClient` / `_cdnClient`
  build a fresh `MtControlClient` / `BucketsClient` each call. They're
  cheap; the Keycloak JWT cache absorbs the round-trip cost. **Don't
  cache them** — long-lived clients holding stale tokens are a
  recurring class of bug.
- **All idempotence is the operator's call.** The recipe does strict
  CREATE everywhere (Keycloak `create*` throw on conflict). On retry
  you call `deprovisionTenant(slug)` first, then `provisionTenant`
  again — there is no "upsert tenant" affordance by design.
- **Endpoint shape**: `meta: ApiOperationMeta` + default handler
  `(req, hub: Hub) => Response`. Throw `HubError` for known failures,
  let unexpected ones bubble (they end up as 500 via `Bun.serve`'s
  outer catch in the runner).

## Dependencies

- runtime: `@bernouy/core`, `@bernouy/cdn-buckets`, `@bernouy/keycloak-client`, `@bernouy/mt-cms-control`
- runtime: `zod`, `@asteasolutions/zod-to-openapi`
