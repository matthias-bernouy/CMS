# @bernouy/cdn-node

CDN **origin** node — admin surface for managing edges + per-edge
secrets endpoint. Composes alongside `@bernouy/cdn-buckets`'s
`StorageProvider` on the same runner: cdn-buckets owns the bucket
serving / admin, cdn-node owns the edge fleet.

## Layout

```
src/
├── interfaces/
│   ├── entities/
│   │   ├── Edge.ts             one edge node (id, label, hostname, sshUser/Port, dataPath, tokenHash)
│   │   └── AccessMetric.ts     daily aggregated access counts per (edgeId, bucketId, day)
│   └── repositories/
│       ├── EdgeRepository.ts
│       └── AccessMetricsRepository.ts
├── exports/
│   └── OriginProvider.ts       composition root: mounts /admin/origin + /edge-api on the runner
├── core/
│   ├── admin/                  mountOriginAdminSurface
│   ├── edge/                   issueEdgeToken, hashEdgeToken, authenticateEdge, computeSecretsResponse
│   ├── lsyncd/                 generate + reload the lsyncd-over-SSH config from the edge list
│   ├── logs/                   pullEdgeLogs (rsync), aggregateAccessLogs (fold .gz into Mongo)
│   ├── monitoring/             edge probes (ssh stat / health checks)
│   └── validation/
├── api/
│   ├── status.get.ts           /admin/origin/api/status
│   ├── edges/                  /admin/origin/api/edges/* (list, edges.post, edges.delete, probe, sync)
│   ├── metrics/                /admin/origin/api/metrics/*
│   └── edge/secrets.get.ts     /edge-api/secrets — bearer-auth, conditional GET (ETag), serves the proxy-secrets manifest
├── components/
│   └── EdgeTokenResultDialog/  shows the cleartext edge token exactly once at creation
├── static/admin/
│   ├── index.html              admin landing page for the origin
│   ├── edges.html              edge fleet
│   └── logs.html               aggregated access metrics
├── default-implementation/     MongoEdgeRepository, MongoAccessMetricsRepository
└── constants.ts                originPackageRoot — derived from import.meta.url
```

## What `OriginProvider` mounts

```
/admin/origin/*    → static admin pages + REST API for edges + monitoring
                     (gated by the `adminGuard` middleware passed in by the consumer)
/edge-api/*        → endpoints that edges call:
                       GET /edge-api/secrets — proxy-secret manifest, bearer-auth, ETag-aware
```

Two surfaces, two auth models:

- **`/admin/origin`** — guarded by the same `Authentication` instance as
  `cdn-buckets/admin` (typically Keycloak). The consumer passes its
  shared `createAdminGuard(auth)` so a single Keycloak session
  authorizes both `/admin/buckets/*` and `/admin/origin/*`.
- **`/edge-api`** — bearer auth via per-edge `tokenHash`. The cleartext
  token is issued by `issueEdgeToken()` at edge creation, returned
  **once** in the create response (operator must copy it), and never
  persisted server-side. Lost token = delete + re-add the edge row.

## Edge token format

`bsedge_<43 base64url chars>` — 32 bytes of entropy. The `bsedge_`
prefix lines up with the `bsp_` / `bspa_` family used by
`BucketCredential` so operators can tell tokens apart at a glance.
`hashEdgeToken(plaintext)` is the canonical hash function;
`authenticateEdge(req, edgeRepo)` does the lookup. Don't reimplement
either at a call site — go through the helpers.

## `/edge-api/secrets` — the manifest channel

This is how proxy secrets reach edges. Flow:

1. Operator creates a `BucketProxy` via cdn-buckets admin/broker. The
   `auth` field is envelope-encrypted under the bucket's DEK.
2. Edges poll `GET /edge-api/secrets` every ~10s with their bearer.
3. The handler decrypts every proxy via `bucketProxyRepo.list()` (the
   repo handles unwrapping), folds them through
   `buildSecretsManifest()` from `@bernouy/cdn-buckets`, and returns
   `{ etag, manifest: { SECRET_xxx: plaintext } }` plus `ETag: "<etag>"`.
4. The edge feeds the manifest to `envsubst` against its synced nginx
   fragment, replaces every `${SECRET_xxx}` placeholder, reloads.
5. Conditional GET: edges send `If-None-Match: "<etag>"` — handler
   returns `304` if unchanged, saving bandwidth on the hot path.

Plaintext secrets travel in the response body — connection MUST be
TLS in production. Origins reachable only on a private network (edges
behind a VPN) MAY drop TLS, but it's still recommended.

## Lsyncd integration

When `OriginConfig.lsyncd` is set, edge mutations regenerate
`/etc/lsyncd/lsyncd.conf.lua` from the current edge list and reload
the supervisor. `regenerateLsyncd()` rebuilds it from scratch — call at
container boot because the config file lives inside the image, not the
volume; a fresh container boots with no config and lsyncd sleeps until
something writes one.

When `lsyncd` is `null` (dev/tests), edge writes only persist in the
DB — useful for unit tests that don't have ssh keys around.

## Log puller loop

`startLogPullerLoop()` (opt-in via `OriginConfig.logs`) runs in-process
every `intervalMs` (default 15 min):

1. `pullAllEdgeLogs(edges, cfg)` — rsync's each edge's rotated `.gz`
   access-log archives over SSH into a local dir.
2. `aggregateAccessLogs(...)` — folds new `.gz` files into the daily
   `AccessMetric` rows (one row per `(edgeId, bucketId, day)`).

Idempotent on both ends: rsync skips files already present, and
aggregation tracks processed filenames to avoid double-counting.
Failures are logged but never crash the loop. First tick fires after
30 s so the rest of the boot can finish first.

## How it composes with `cdn-buckets`

The two packages run on the **same runner** in the cdn-origin
deployment:

```ts
// pseudo-code from the consumer's bootstrap
const storageProvider = new StorageProvider({ runner, authentication, ... });
const originProvider  = new OriginProvider({
    runner,                                 // same runner
    authentication,                         // same auth
    edgeRepo, accessMetricsRepo,
    bucketProxyRepo: storageProvider.bucketProxyRepo,  // shared!
    adminGuard:      createAdminGuard(authentication),
    config,
});
```

The shared `bucketProxyRepo` is how `/edge-api/secrets` reads the
encrypted proxies that `/admin/proxies` (cdn-buckets) wrote. Both
sides envelope-encrypt/decrypt through the same `SecretCrypto`
instance.

## Conventions

- **Path resolution via `originPackageRoot`** (from `constants.ts`).
  Same rule as cdn-buckets — never `__dirname` or relative `../../`.
- **Endpoints are file-routed via `serveApi`** (`<segment>.<method>.ts`).
  Keep them thin: parse → call `core/edge/...` or `core/logs/...` →
  return.
- **`EdgeRepository` returns `Edge` rows verbatim** — the `tokenHash`
  is a hex SHA-256, never the cleartext. The cleartext exists only in
  the response of `POST /admin/origin/api/edges`.
- **Mongo access-metric `bucketId === ""`** captures events that
  didn't resolve to a bucket (port-80 redirects, 444s). Worth keeping
  for totals; filter it out at query time when answering "per-bucket".
- The `static/admin/` pages assume the cdn-buckets-side admin chrome
  components (`<cms-fetch>`, `<cms-form>`, …) are loaded — the edges
  UI lives under the same admin shell.

## Dependencies

- runtime: `@bernouy/core`, `@bernouy/cdn-buckets`, `@bernouy/webcomponents`
- peer (optional): `mongodb`
