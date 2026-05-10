# @bernouy/cms-delivery-mt

Multi-tenant build-time Delivery cron. Periodically iterates the
tenant registry written by `@bernouy/mt-cms-control`, picks the
tenants whose `delivery.enabled === true`, and runs one
`DeliveryBuilder` cycle per tenant. Renders pages, generates image
variants, uploads everything to the tenant's public CDN bucket.

This is **not** an HTTP server — it's a long-lived cron process. The
public-facing rendering at runtime is the cdn-edge (nginx) serving the
bucket bytes.

## Layout

```
src/
├── exports/
│   └── MtDeliveryCms.ts      cron orchestrator: setTimeout-driven tick, bounded concurrency, shared Playwright session
├── core/
│   └── tenant/
│       └── buildTenant.ts    one cycle for one tenant — wires MongoCmsRepository + StorageDirectClient + DeliveryBuilder
└── index.ts                  re-exports MtDeliveryCms + buildTenant
```

Three files. The package is a thin assembly — every primitive
(`DeliveryBuilder`, `BuildEnhancer`, `HttpVariantGenerator`,
`PlaywrightSession`, `pageBucketName`) is imported from
`@bernouy/cms`; storage from `@bernouy/cdn-buckets`;
tenant registry from `@bernouy/mt-cms-control`.

## `MtDeliveryCms` cycle

```
constructor → start()
                │
                ▼
          setTimeout tick (default every 60 000 ms)
                │
                ▼
   list tenants from TenantRepository, filter delivery.enabled
                │
                ▼
   createConcurrencyLimit(default 4) → buildTenant in parallel
                │
                ▼
                ▼
            stop() — clearTimeout + close Playwright session
```

- **Single Playwright session shared across tenants** (default on).
  `new PlaywrightSession()` launches one Chromium; every tenant's
  `BuildEnhancer` reuses the same `session` instance. Disable via
  `enableImageEnhancement: false` (no `BuildEnhancer` is wired, pages
  ship as-rendered).
- **Failures are isolated.** A throwing tenant logs `[delivery]
  tenant=<id> build failed` but the tick continues. The next tick
  retries.
- **`stop()` is awaitable** — it sets `_stopping`, clears the timer,
  then `await session.close()`. SIGTERM handler in the docker
  container should call it before exiting.

## `buildTenant` (one tenant, one cycle)

For tenant `t`:

1. Open a Mongo `CmsRepository` scoped to `tenant_${t.id}__*`
   collections (see `cms-control-mt`'s convention).
2. `StorageDirectClient.fromCredential(t.delivery.publicCdn)` — direct
   client (holds the credential, hits frontier B). The same bucket is
   used for HTML and assets.
3. Wire image-variant generation:
   - When `variantUrlPattern` is set, the pattern is templated with
     `{url}`, `{width}`, `{format}` to build resize-backend URLs.
   - When omitted, `HttpVariantGenerator` throws on every spec and
     `DeliveryBuilder` reports per-page failures (pages still ship,
     without `srcset`).
4. `DeliveryBuilder.runOnce()` — fingerprints repo state into the
   bucket's `_manifest.json` and bails when nothing changed.
5. On a real change, sync the bucket's `notFoundPath` with whatever
   the CMS admin selected via `system.site.notFound`. Skipped on no-op
   cycles to avoid hammering bucket settings.

The image ladder is hardcoded today: `[320, 640, 960, 1280, 1920]`.
If you tune it, do it in `buildTenant.ts` — there's no per-tenant
override yet.

## Tenant data layout (read from)

Per-tenant Mongo collections are prefixed `tenant_${tenant.id}__` —
mirror of what `cms-control-mt` writes when it mounts a tenant's
Control. Delivery shares the same `Db` handle, ideally as a
**read-only** Mongo user (the cron only reads CMS rows, then writes to
the bucket).

`tenant.delivery.publicCdn` carries:
- `url` — provider origin of the cdn-buckets instance
- `bucketCredential` — cleartext credential used by
  `StorageDirectClient`

Both are set by the superadmin when wiring delivery. If `publicCdn` is
absent, `buildTenant` throws — guarded upstream by the
`delivery.enabled` filter, so this is a config bug if it triggers.

## Conventions

- **No HTTP server.** This package never calls `runner.start()`. The
  docker image's `server.ts` instantiates `MtDeliveryCms`, calls
  `start()`, then waits on a stop signal.
- **Cycles are idempotent.** Don't add side effects in `buildTenant`
  that aren't gated on `result.changed` — every minute would otherwise
  retrigger them.
- **One Playwright per process.** Adding `new PlaywrightSession()`
  inside `buildTenant` would launch a Chromium per tenant per minute;
  always reuse the one held by `MtDeliveryCms`.
- **Bounded concurrency** via `createConcurrencyLimit` from
  `@bernouy/core` — don't reach for `Promise.all(tenants.map(…))`
  unbounded.
- **First tick fires immediately** (`setTimeout(tick, 0)`), then on the
  interval. Delivery starts working as soon as the process boots.

## Dependencies

- runtime: `@bernouy/core`, `@bernouy/cdn-buckets`, `@bernouy/cms`, `@bernouy/mt-cms-control`
- peer: `mongodb`, `playwright`
