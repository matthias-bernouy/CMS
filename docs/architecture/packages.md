# Workspace Package Map

This inventory follows the package manifests under `packages/`. Public APIs are
the exact exports declared in each `package.json`; package-local `AGENTS.md`
files explain implementation invariants.

## Foundation

| Package | Responsibility |
| --- | --- |
| `@bernouy/binary-media` | Immutable binary snapshots, SHA-256 identities, representation fingerprints and bounded media signature inspection. |
| `@bernouy/blob-store` | Stream-first opaque blob contracts with memory, local-filesystem and S3-compatible adapters. |
| `@bernouy/http-runner` | Runner abstractions, Bun HTTP serving, cache, compression, CSP and test helpers. |
| `@bernouy/envelope-crypto` | Envelope encryption, KEK/DEK contracts and Mongo DEK storage. |
| `@bernouy/rate-limiter` | Fixed-window rate limiting with memory and Mongo implementations. |
| `@bernouy/secret-store` | Secret storage, reference resolution and encrypted Mongo persistence. |
| `@bernouy/image-processing` | Generic image inspection and WebP transforms; its optional Sharp adapter serves author files and gateway media. |

## Features

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-content` | Pages, routes, Blocs, settings, themes, browser Component/binding runtime, authoring contracts, collection migration execution and the author file library. |
| `@bernouy/cms-repository` | Contract releases, provider manifests, site installations/selections, catalogues and authored collections with surface-specific Pages. |
| `@bernouy/cms-gateway` | Authorized capability invocation, provider identity aliases, file reads and image derivatives. |
| `@bernouy/cms-auth` | Accounts, local/OIDC providers, PATs, signed sessions, public auth operations and email composition. |
| `@bernouy/cms-collection-build` | Collection Bloc validation, browser artifact builds and source-bundle generation. |

Collection Pages are admitted resources, but their route registry and rendering
flow are not mounted yet. There is no separate Dashboard package, persistence model or runtime.
`cms-collection-build` remains a separate feature package.

The old `cms-sources`, `cms-source-images`, `cms-identities` and `cms-secrets`
packages are absent. Provider invocation, identities and media belong to
Gateway; generic binary inspection, blob storage, secret storage and image processing belong to Foundation.
The `cms-source` HTML attribute remains the active binding API.

## Official Products

`packages/official-repository` contains the authored official contract releases,
the `ulvia.official` provider manifest and official collections. It has no
runtime adapters or routes. `@bernouy/official-repository-server` publishes and
serves admitted copies from a separate persistent volume.
`@bernouy/ulvia-official-provider` is the separate
provider product; its root exports domain behavior, `./local-fs` exports the
development adapter and `./server` is its executable entrypoint.

## Surfaces And Runtimes

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-control` | Authenticated admin UI, REST API, author media and selected gateway capability access. |
| `@bernouy/cms-delivery` | Public pages, Bloc assets, binding runtime, auth, media, gateway calls and SEO. |
| `@bernouy/cms-server` | Production adapter composition and Control/Delivery startup. |
| `@bernouy/official-repository-server` | Production official repository startup with persistent staged publication and immutable reads. |
| `@bernouy/ulvia-cli` | Persistent local CMS development stack backed by MongoDB. |

See [workspace architecture](README.md) for dependency direction and
[repository and gateway flows](../providers/README.md) for runtime wiring.
