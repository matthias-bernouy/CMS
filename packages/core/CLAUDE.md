# @bernouy/core

The contracts shared by every other workspace package, plus a handful
of low-level helpers (HTTP serve, credentials, envelope crypto).
**Browser-safe** by default — only the OVH OKMS provider and `loadKek`
touch Node-only APIs (`node:fs`).

## Layout

```
src/
├── interfaces/
│   ├── Runner.ts              Runner contract (verb routes, groups, middlewares, default endpoint, IP capture, dynamic teardown)
│   ├── Authentication.ts      Subject<Role> + Authentication<Role> + DefaultRole = "admin" | "user"
│   ├── Mailer.ts              MailMessage + Mailer
│   └── CDN.ts                 CDN single-bucket contract — strict portability rules (see "CDN portability" below)
├── serve/
│   ├── serveApiFolder.ts      file-routed REST: <name>.<method>.ts → addEndpoint(method, /name, handler)
│   └── serveStaticFolder/     scan + prepareHtml + replaceBasePath → mounts every .html with template injection
├── auth/
│   └── requireRole.ts         middleware factory with optional CSRF policy ("off" / "cookie-only" / "always")
├── credentials/
│   ├── Credential.ts          { id, tokenHash, label?, createdAt, expiresAt?, revokedAt? } — never store cleartext
│   ├── CredentialRepository.ts CRUD + getByTokenHash hot path
│   ├── CredentialAuthentication.ts Authentication<Role> over Authorization: Bearer + WeakMap-via-Symbol stash
│   └── generateBearerToken.ts cleartext + sha256Hex pair
├── crypto/                    envelope encryption (KEK + per-scope DEK + cached unwrap)
│   ├── aesGcm.ts              encryptAesGcm / decryptAesGcm + EncryptedBlob
│   ├── KekProvider.ts         interface (generateDek + unwrap)
│   ├── LocalKekProvider.ts    in-process AES-KW wrap, for dev / single-node
│   ├── OvhOkmsKekProvider.ts  REST + mTLS against OVH OKMS, with fatal vs transient retry split
│   ├── DekRepository.ts       interface — persisted { scopeId, wrapped, createdAt, rotatedAt }
│   ├── EnvelopeSecretCrypto.ts SecretCrypto impl, TTL+LRU DEK cache, in-flight dedup per scope
│   ├── SecretCrypto.ts        encrypt/decrypt(scopeId, …)
│   └── loadKek.ts             base64 → 32 bytes, fail-fast at boot
└── utilities/
    ├── crypto.ts              sha256Hex + randomBase64Url
    ├── html.ts                escapeHtml + htmlResponse + redirect
    ├── requestIP.ts           getRequestIP / setRequestIP (Symbol.for('@bernouy/core::requestIP'))
    └── concurrencyLimit.ts    in-process FIFO semaphore
```

## Rules every contract enforces

- **`Authentication.getSubject` never throws on a "not authenticated"
  case.** Returning `null` is the contract for any failure mode (no
  session, expired, invalid signature, …). Throwing is reserved for
  bugs.
- **`Subject.identifier` is opaque.** Not an email, not a display name —
  consumers stash whatever stable id their backend exposes.
- **`Runner` is a contract, not a class.** `removeRoutesByPathPrefix`
  is the multi-tenant teardown hook. `setDefaultEndpoint` is what lets
  a Delivery server fall through to on-demand page rendering.
- **`Mailer.send` is the only method.** No `sendBatch`, no template
  language. Consumers that need email build the body themselves.
- **`CDN` is one bucket.** Multi-bucket fan-out (admin / provisioning)
  used to live in a separate provider contract (now removed). Don't
  generalize this interface.

## CDN portability — the single most enforced rule

The `CDN` interface in `src/interfaces/CDN.ts` ships a long contract
comment because it is **non-negotiable**. Implementations of `CDN` must
be browser-deployable and serializable via `constructor.toString()` so
the CMS can ship them to the browser as `window._cms.CDN`:

- No external function reference — every helper a method needs lives
  as a private method on the same class. No module-level `function
  helper()`.
- No runtime `import { … }` — only `import type { … }` (erased at
  compile time).
- Only Web-standard globals (`fetch`, `URL`, `Blob`, `FormData`,
  `crypto`, `ReadableStream`, …). No Node APIs.
- No side effects at module load.
- Server-side concerns (master credentials, token minting, storage
  SDKs) live **outside** the CDN impl, behind HTTP.

`HttpMedia` in the test harness is the canonical example. If you're
reviewing a new CDN impl, this is the rule that bites.

## `serveApi` (file-routed REST)

`serveApi(runner, folder, system)`:

- Globs `**/*.{ts,js}` under `folder`.
- Filename → `<segments>.<method>.ts` (case-insensitive on the method);
  segments map to URL via `deriveRoute`:
  - `dir/file.get.ts`  → `/dir/file`
  - `dir/dir.get.ts`   → `/dir` (filename = parent → collapses)
  - flat `name.get.ts` → `/name`
- **Conflicts throw at boot.** Two files declaring the same `METHOD route`
  will fail-fast — never silently let a later file shadow an earlier one.
- Handler signature is `(req, system) => Response | Promise<Response>`,
  with `system` being the second arg you pass into `serveApi` (the
  package-level "world" object).
- Modules are dynamically imported by absolute path. **Side-effect: a
  module loaded this way is a different instance than one loaded
  through the regular import graph.** That's why `CredentialAuthentication`
  pins its WeakMap on `globalThis[Symbol.for(...)]` — search for
  `SHARED_KEY` if you hit "credential not found despite auth ran".

## `serveStaticFolder` (HTML pages with template injection)

`serveStaticFolder(runner, template, path)`:

- `.html` files → registered as `GET <relativePath without .html>`
  (`index.html` → `/`, `dir/index.html` → `/dir`).
- Other files → served verbatim with `Bun.file`.
- The `template` string is the chrome (`<!doctype html>` + head + body
  shell). `prepareHtml` injects the page content into `{{CONTENT}}` and
  replaces `{{BASE_PATH}}` with `runner.basePath` in **both** the
  template and the page content. Asset references must use
  `{{BASE_PATH}}/…`.

## `requireRole` (auth middleware)

`requireRole(auth, role, options?)` returns a `Middleware` that:

1. Optionally checks CSRF on mutating methods (POST/PUT/PATCH/DELETE).
   Three modes:
   - `"off"` (default) — never checks. Safe for bearer-only surfaces.
   - `"cookie-only"` — skips when `Authorization` header is present
     (bearer auth is CSRF-immune); enforces same-origin otherwise.
   - `"always"` — enforces on every mutating request.
2. Calls `auth.getSubject(req)`; null → 401 (overridable via
   `onUnauthenticated`).
3. Compares `subject.role === role`; mismatch → 403 (overridable via
   `onForbidden`).

CSRF check is lenient: missing Origin/Referer is acceptable; it only
rejects when present and cross-origin.

## Credentials

`CredentialAuthentication` is the `Authorization: Bearer` consumer side
of the credential pair:

- Looks up the credential by `sha256Hex(cleartext)`. Cleartext is
  **never** persisted.
- Rejects revoked or expired credentials.
- Stashes the **full credential** on a `WeakMap<Request, Credential>`
  pinned via `Symbol.for("@bernouy/core::CredentialAuthentication::credentialByRequest")`.
  Downstream handlers retrieve it via `getCredential(req)` /
  `requireCredential(req)` to access consumer-extended fields
  (`bucketId`, `tenantId`, …) that don't fit `Subject`.
- `loginUrl` / `logoutUrl` / `profileUrl` are `""` — composes via
  `auth-composite` where the cookie child supplies the URLs.

`generateBearerToken()` produces `{ cleartext, tokenHash }`. Hand
`cleartext` to the user once at creation; persist `tokenHash`.

## Envelope encryption — `EnvelopeSecretCrypto`

The `SecretCrypto` impl shipped here is the only one. Architecture:

- A **KEK** (32 bytes AES-256) sits in a `KekProvider`. Two providers
  ship today: `LocalKekProvider` (in-process AES-KW from `loadKek`),
  `OvhOkmsKekProvider` (mTLS to OVH OKMS — KEK never leaves OVH's HSM).
- A per-scope **DEK** is generated on demand and persisted (wrapped) in
  a `DekRepository`. The wrapped form is opaque to the impl.
- `EnvelopeSecretCrypto.encrypt(scopeId, plaintext)` looks up or
  generates the DEK, then `encryptAesGcm`. `decrypt` throws when no DEK
  exists — encrypted data referencing a vanished key is data loss; the
  caller must surface it.
- Unwrapped DEKs cache in-process: TTL (default 30 min) + LRU
  (default 1000 entries). The cache absorbs hot reads so a network
  KekProvider doesn't pay a round-trip per secret.
- **Concurrency contract:** at most one in-flight DEK resolution per
  scope (`_inflight: Map<string, Promise<Buffer>>`). Without it, three
  parallel encrypts on a fresh scope each generate + upsert their own
  DEK and the last write silently invalidates the first two ciphertexts.
  Don't remove this dedup.

`OvhOkmsKekProvider` splits HTTP errors into `transient` (5xx, 408,
429, network) → retry with exponential backoff to a 10s ceiling vs
`fatal` (other 4xx, malformed body) → throw `OvhOkmsError`. Logs never
contain plaintext or the JWE.

`loadKek(envValue, envVarName)` decodes a base64 KEK, requires exactly
32 bytes, fails fast otherwise (silently downgrading to AES-128 would
be worse than refusing to boot).

## Conventions

- **Browser-safe by default.** Anything that touches `node:fs` is in
  `loadKek` and `OvhOkmsKekProvider` (cert + key read at construction).
  Don't `import "node:..."` in any other file without flagging it.
- **`requestIP` uses `Symbol.for(...)`** to survive re-imports across
  the dynamic-import boundary that `serveApi` introduces. Same trick
  as `CredentialAuthentication`'s WeakMap.
- **Errors**: contracts return `null` for routine "not found / not
  authenticated" cases; throw for misconfiguration (bad KEK length,
  duplicate route, missing handler default-export).
- **No package re-exports its own interfaces.** If you find yourself
  copying a type from `core` into another package, re-export the
  `core` symbol instead.

## Dependencies

None at runtime. Type-only and Web-standard globals. The OVH provider
relies on `Bun.fetch`'s `tls: { cert, key }` option — that's why this
package targets Bun, not generic Node.
