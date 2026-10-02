# Workspace Package Map

This inventory follows the package manifests under `packages/`. Public APIs are
the exact exports declared in each `package.json`; package-local `AGENTS.md`
files explain implementation invariants.

## Foundation

| Package | Responsibility |
| --- | --- |
| `@bernouy/components` | Public custom elements, base components and declarative data binding. |
| `@bernouy/http-runner` | Runner abstractions, Bun HTTP serving, cache, compression, CSP and test helpers. |
| `@bernouy/envelope-crypto` | Envelope encryption, KEK/DEK contracts and Mongo DEK storage. |
| `@bernouy/rate-limiter` | Fixed-window rate limiting with memory and Mongo implementations. |
| `@bernouy/secret-store` | Secret storage, reference resolution and encrypted Mongo persistence. |
| `@bernouy/image-processing` | Generic image inspection and WebP transforms; its optional Sharp adapter serves author files and gateway media. |

## Features

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-content` | Pages, routes, Blocs, settings, themes, authoring contracts and the author file library. |
| `@bernouy/cms-repository` | Contract releases, provider manifests, site installations/selections, catalogues and authored collections with Control HTML views. |
| `@bernouy/cms-gateway` | Authorized capability invocation, provider identity aliases, file reads and image derivatives. |
| `@bernouy/cms-auth` | Accounts, local/OIDC providers, PATs, signed sessions, public auth operations and email composition. |
| `@bernouy/cms-dashboards` | Site dashboard records, collection view mounts and direct subject assignments. |
| `@bernouy/cms-collection-build` | Collection Bloc validation, browser artifact builds and source-bundle generation. |

`cms-dashboards` owns site activation, private dashboard records and member
assignments over collection-owned views, not view content or the removed widget
runtime. Collection dashboard templates live in collection releases.
Provider-backed view execution remains future work. `cms-collection-build` remains
a separate feature package.

The old `cms-sources`, `cms-source-images`, `cms-identities` and `cms-secrets`
packages are absent. Provider invocation, identities and media belong to
Gateway; generic secret storage and image processing belong to Foundation.
The `cms-source` HTML attribute remains the active binding API.

## Official Products

`packages/official-repository` contains the authored official contract releases,
the `ulvia.official` provider manifest and official collections. It has no
runtime adapters or routes. `@bernouy/ulvia-official-provider` is the separate
provider product; its root exports domain behavior, `./local-fs` exports the
development adapter and `./server` is its executable entrypoint.

## Surfaces And Runtimes

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-control` | Authenticated admin UI, REST API, author media and selected gateway capability access. |
| `@bernouy/cms-delivery` | Public pages, Bloc assets, binding runtime, auth, media, gateway calls and SEO. |
| `@bernouy/cms-server` | Production adapter composition and Control/Delivery startup. |
| `@bernouy/ulvia-cli` | Persistent local CMS development stack backed by MongoDB. |

See [workspace architecture](README.md) for dependency direction and
[repository and gateway flows](../providers/README.md) for runtime wiring.
