# @bernouy/cdn-buckets

Single-bucket CDN — admin surface, broker, browser-deployable client,
direct server client, plus the Mongo persistence and envelope-encrypted
proxy secrets. Implements the `CDN` contract from `@bernouy/core` for
the consumer-facing `StorageBrowser`.

## Layout

```
src/
├── interfaces/
│   ├── entities/                       Bucket, BucketCredential, PreSignedToken, Alias, StoredFolder, StoredFile, BucketProxy
│   ├── repositories/                   one repo contract per entity
│   ├── BlobStorage.ts                  blob put/get/delete/stream contract
│   └── wire/AdminResponse.ts           AdminResponse<T> envelope used by /admin/api/*
├── exports/                            public classes
│   ├── StorageProvider.ts              the server (admin + broker + upload endpoint)
│   ├── StorageTokenBroker.ts           server companion that proxies frontier A → frontier B with the bucket credential
│   ├── StorageBrowser.ts               browser-deployable CDN impl (talks to a broker — never holds the credential)
│   ├── StorageDirectClient.ts          server-side CDN impl that holds the credential directly (Delivery cron)
│   ├── BucketsClient.ts                typed admin REST client (used by hub-api)
│   └── BucketProxyPublisher.ts         bucket-scoped CMS proxy-rule publisher (matches the CMS's ProxyPublisher slot)
├── core/                               business logic
│   ├── admin/, alias/, authentication/, broker/, bucket/, content/,
│   ├── credential/, crypto/, nginx/, proxy/, upload/, validation/
│   └── ids.ts
├── api/
│   ├── admin/                          /admin/api/* — file-routed via serveApi (buckets, credentials, files, folders, items, aliases, proxies)
│   ├── broker/                         /api/* — file-routed via serveApi (frontier B: bucket, items, folders, upload-tokens, proxies)
│   ├── upload.post.ts                  POST /upload — direct upload with pre-signed token
│   └── upload.options.ts               CORS preflight for /upload
├── components/                         admin-side custom elements (CredentialResultDialog, ProxyCreateForm, UploadForm)
├── static/admin/                       admin SSR pages (buckets.html, bucket-detail.html)
├── default-implementation/
│   ├── EnvelopeSecretCrypto.ts         re-export shim for compatibility (canonical lives in @bernouy/core)
│   ├── LocalBlobStorage.ts             filesystem BlobStorage impl
│   └── mongo/                          one Mongo repo per entity (Bucket, BucketCredential, PreSignedToken, Alias, StoredFolder, StoredFile, BucketProxy, BucketDek)
└── constants.ts                        cdnPackageRoot — derived from import.meta.url, never use __dirname/relative
```

## The two HTTP surfaces — frontier A vs frontier B

`StorageProvider` mounts **two** HTTP surfaces on its runner:

| Surface | Mount | Auth | Caller |
|---|---|---|---|
| **Admin** | `/admin` | `Authentication` (typically Keycloak cookie + bearer JWT via `auth-composite`) | the bucket operator (UI) and the central hub (`BucketsClient` with a service-account JWT) |
| **Broker (frontier B)** | `/api` | `CredentialAuthentication` over a per-bucket `BucketCredential` (cleartext bearer) | a `StorageTokenBroker` instance running inside the consumer app (CMS, Delivery cron) |
| **Upload** | `POST /upload` (no prefix) | pre-signed token in the URL | the browser, after a `mintUploadToken` round-trip |

`StorageTokenBroker` is the **frontier A**: an HTTP relay mounted on
the consumer's runner (default `/_storage`) that forwards every method
to the provider's frontier B with the credential bearer attached.
The browser only ever sees frontier A — the credential never leaks.

Three CDN client classes wrap these surfaces:

- **`StorageBrowser`** — browser-deployable `CDN` impl. Hits the broker
  frontier A. Strict portability rules (see below).
- **`StorageDirectClient`** — server-side `CDN` impl. Holds the
  credential directly, hits frontier B. Counterpart for processes that
  trust themselves with the bearer (Delivery build cron). **Never
  serialize this to the browser.**
- **`BucketsClient`** — typed REST client for the admin surface
  (`/admin/api/*`). Auth = Keycloak service-account JWT. Used by
  `hub-api` to provision buckets per tenant.

## Browser-deployable contract — `StorageBrowser`

`StorageBrowser` is the canonical implementation of the `CDN`
portability rules from `@bernouy/core`:

- Every helper is a private method on the class — no module-level
  function.
- `import type` only — no runtime imports.
- Only Web-standard globals (`fetch`, `URL`, `URLSearchParams`,
  `Blob`, `FormData`, `crypto`, `ReadableStream`, `AbortSignal`).
- No Node APIs, no side effects at load.

The CMS serializes `StorageBrowser` via `constructor.toString()` and
ships the result + a hydration payload to the browser as
`window._cms.CDN`. **If you add anything to `StorageBrowser`, run
through these rules first.** A single module-level helper breaks
hydration silently — the class deserializes, but calls fail at runtime.

`StorageTokenBroker.getHydrationScript()` produces the rehydration
payload (`apiBaseUrl`, bucket info, browser origins for CSP).

## Bucket credential model

A `BucketCredential` (in `interfaces/entities/`) extends `Credential`
from `@bernouy/core` with `bucketId` and the bucket scope. Storage:
only `tokenHash` (SHA-256) is persisted; cleartext is returned exactly
once at creation via the admin endpoint.

`StorageProvider` composes `CredentialAuthentication<BucketCredential,
"tenant">` → projects each credential to a `Subject<"tenant">`. The
broker surface guards on `requireRole(brokerAuth, "tenant")`. Any
broker handler can call `requireCredential<BucketCredential>(req)` to
recover the full `bucketId` + scope.

## Upload pipeline (3-leg)

```
Browser                           Broker (frontier A)               Provider (frontier B)
   │ mintUploadToken                  │ proxy →                          │
   │ ────────────────────────────────►│ ──────────────────────────────►  │ POST /api/upload-tokens
   │                                  │                                  │ → { uploadURL, expiresAt }
   │                                  │ ◄──────────────────────────────  │
   │ ◄────────────────────────────────│
   │
   │ POST <uploadURL> (raw bytes)                                        │
   │ ────────────────────────────────────────────────────────────────►   │ POST /upload?token=…
   │ ◄──────────────────────────────────────────────────────────────     │ → { ok: true, data: FileMetadata }
```

The pre-signed `uploadURL` resolves directly to the provider origin;
the broker isn't on the upload path. CSP `connect-src` on the consumer
admin must whitelist the provider origin (the hydration script lists
it in `origins`).

## Envelope encryption

Every secret persisted by this package goes through the
`EnvelopeSecretCrypto` impl (from `@bernouy/core`):

- One DEK per bucket, persisted by `MongoBucketDekRepository` (a
  `DekRepository` instance scoped to bucket id).
- The KEK is supplied by the consumer via a `KekProvider`
  (`LocalKekProvider` for dev, `OvhOkmsKekProvider` in prod).
- Today's only encrypted field: `BucketProxy.auth` (HTTP basic /
  bearer secrets shipped to edges).
- Adding another encrypted field: route writes through
  `secretCrypto.encrypt(bucketId, plaintext)`, reads through
  `secretCrypto.decrypt(bucketId, blob)`. **Don't introduce a second
  scope id convention** — bucket id is the canonical scope.

## Bucket proxy → edge pipeline

The proxy subsystem (`core/proxy/*` + `core/nginx/*`) generates the
nginx config that lets the cdn-edge serve `/.cms/data/<providerId>/*`
endpoints with proxy-set credentials:

1. Admin/broker `POST /api/proxies` writes a `BucketProxy` row, with
   `auth` envelope-encrypted under the bucket DEK.
2. `buildSecretsManifest(proxies)` flattens decrypted `auth` values
   into a `placeholder → plaintext` map.
3. `cdn-node`'s `/edge-api/secrets` endpoint serves this manifest to
   each edge over its bearer-protected channel.
4. Edges run `envsubst` on the synced nginx fragment, replacing every
   `${SECRET_<hash>}` placeholder with its plaintext value, then reload
   nginx.

`placeholderName(value)` is the deterministic hash function — never
inline-compute placeholders, always go through it.

## Nginx integration

When `StorageProviderConfig.nginx` is set (prod), bucket / alias
mutations regenerate fragment files (`buckets.conf`,
`notFoundPaths.conf`, `aliases.conf`, `aliasesServers.conf`) and
trigger an nginx reload. `regenerateAllNginx()` rebuilds everything
from current DB state — call once at container boot because the
generated fragments live inside the image, not the volume.

When `nginx` is **not** set (dev / tests), mutations succeed silently
without writing fragments. Don't sprinkle `if (!config.nginx)` checks
across business logic — the `applyBucketChanges` / `applyAliasChanges`
helpers handle the absence centrally.

## Conventions

- **Path resolution via `cdnPackageRoot`.** Anything that needs
  `serveApi(folder)` / `serveStaticFolder(path)` must use
  `join(cdnPackageRoot, "src/api/admin")` (or similar). Never
  `__dirname` (breaks under packaging) or relative `../../`.
- **Endpoints are file-routed via `serveApi`.** Keep them thin: parse
  → call `core/...` → return. Business logic in `core/`. The convention
  matches `cms/api/` — `<segment>.<method>.ts` → `<METHOD> /<segment>`.
- **Admin pages are SSR HTML in `static/admin/`.** No `.client.ts` /
  `.server.ts` split; pages compose `<cms-fetch>` / `<cms-form>` /
  `<cms-validate>` from `@bernouy/webcomponents` (consumed via the
  built bundle).
- **Components in `src/components/`** are hand-written admin custom
  elements bundled by `build-components.ts` into `dist/components/`.
  Self-register under `<p9r-*>`-style tags.
- **`Date` round-trips as ISO string** on every `BucketsClient` view
  type. Parse on the caller side if needed.
- **`AdminResponse<T>`** is the wire envelope for `/admin/api/*`:
  `{ ok: true; data: T }` / `{ ok: false; error: { code, message } }`.
  Don't invent a new shape; route through it.

## Reference docs in repo

- `docs/dev/getting-started.md` — local dev path A (no Nginx) + path
  B (Nginx-enabled).
- `docs/prod/getting-started.md` — production setup, lego cert
  orchestration.
- `docs/tests/local-scenario.md` — end-to-end runbook from a consumer
  package perspective.

These were written earlier in the project; double-check claims against
current code before relying on them.

## Dependencies

- runtime: `@bernouy/core`, `@bernouy/webcomponents`
- peer (optional): `image-size`, `mongodb`
