# @bernouy/core

The contracts shared by every other workspace package, plus a handful
of low-level helpers (HTTP serve, signed cookies, envelope crypto).
**Browser-safe** by default — only `loadKek` touches Node-only APIs
(`node:fs`).

## Layout

```
src/
├── interfaces/
│   ├── Runner.ts              Runner contract (verb routes, groups, middlewares, default endpoint, IP capture, dynamic teardown)
│   └── Authentication.ts      Subject<Role> + Authentication<Role> + DefaultRole = "admin" | "user"
├── serve/
│   ├── serveApiFolder.ts      file-routed REST: <name>.<method>.ts → addEndpoint(method, /name, handler)
│   └── serveStaticFolder/     scan + prepareHtml + replaceBasePath → mounts every .html with template injection
├── auth/
│   └── SignedCookieCodec.ts   HMAC-signed cookie payload codec (used by auth-core's LocalAuthentication)
├── crypto/                    envelope encryption (KEK + per-scope DEK + cached unwrap)
│   ├── aesGcm.ts              encryptAesGcm / decryptAesGcm + EncryptedBlob
│   ├── KekProvider.ts         interface (generateDek + unwrap)
│   ├── LocalKekProvider.ts    in-process AES-KW wrap, for dev / single-node — the only impl shipped
│   ├── DekRepository.ts       interface — persisted { scopeId, wrapped, createdAt, rotatedAt }
│   ├── EnvelopeSecretCrypto.ts SecretCrypto impl, TTL+LRU DEK cache, in-flight dedup per scope
│   ├── SecretCrypto.ts        encrypt/decrypt(scopeId, …)
│   └── loadKek.ts             base64 → 32 bytes, fail-fast at boot
└── utilities/
    ├── crypto.ts              sha256Hex + randomBase64Url
    ├── html.ts                escapeHtml + htmlResponse + redirect
    └── requestIP.ts           getRequestIP / setRequestIP (Symbol.for('@bernouy/core::requestIP'))
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
  through the regular import graph.** That's why `requestIP` pins its
  storage on `globalThis[Symbol.for(...)]` — search for `SHARED_KEY`
  if you hit "request IP not found despite the runner set it".

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

## Envelope encryption — `EnvelopeSecretCrypto`

The only `SecretCrypto` impl shipped here. Architecture:

- A **KEK** (32 bytes AES-256) sits in a `KekProvider`. The only
  provider shipped is `LocalKekProvider` (in-process AES-KW from
  `loadKek`). Consumers that need a remote/managed KEK (cloud KMS,
  HSM, …) supply their own `KekProvider` impl.
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

`loadKek(envValue, envVarName)` decodes a base64 KEK, requires exactly
32 bytes, fails fast otherwise (silently downgrading to AES-128 would
be worse than refusing to boot).

## Conventions

- **Browser-safe by default.** Anything that touches `node:fs` is in
  `loadKek` (cert + key read at construction). Don't `import "node:..."`
  in any other file without flagging it.
- **`requestIP` uses `Symbol.for(...)`** to survive re-imports across
  the dynamic-import boundary that `serveApi` introduces.
- **Errors**: contracts return `null` for routine "not found / not
  authenticated" cases; throw for misconfiguration (bad KEK length,
  duplicate route, missing handler default-export).
- **No package re-exports its own interfaces.** If you find yourself
  copying a type from `core` into another package, re-export the
  `core` symbol instead.

## Dependencies

None at runtime. Type-only and Web-standard globals.
