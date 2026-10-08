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
| `@bernouy/image-processing` | Generic image inspection and WebP transforms used by Files provider implementations. |

## Features

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-content` | Pages, routes, Blocs, settings, themes, browser Component/binding runtime, authoring contracts and collection migration execution. |
| `@bernouy/cms-files` | Official provider implementation for namespaces, credentials, uploads, immutable files, private signatures and image representations. |
| `@bernouy/cms-repository` | Contract releases, provider manifests, site installations/selections, catalogues, authored collections, and the explicit collection build toolchain. |
| `@bernouy/cms-gateway` | Authorized provider-neutral capability invocation, identities and streaming binary transport. |
| `@bernouy/cms-auth` | Accounts, local/OIDC providers, PATs, signed sessions, public auth operations and email composition. |

Collection Pages are admitted resources and their route registry, rendering and
revisioned execution-plan activation are mounted by Control. There is no separate
Dashboard package, persistence model or runtime.
Collection Bloc compilation is available only through the explicit
`@bernouy/cms-repository/collections/build` tooling subpath. Site-owned Bloc
source serialization remains in `cms-content` because it publishes mutable CMS
content rather than an immutable collection release.

The old `cms-sources`, `cms-source-images`, `cms-identities` and `cms-secrets`
packages are absent. Provider invocation and identities belong to Gateway;
file and image semantics belong to Files providers; generic binary inspection,
blob storage, secret storage and image processing belong to Foundation.
The `cms-source` HTML attribute remains the active binding API.

## Official Products

`packages/official-repository` contains the authored official contract releases,
the `ulvia.official` CMS Core provider manifest and official collections. It has
no runtime adapters or routes. `@bernouy/official-repository-server` publishes
and serves admitted copies from a separate persistent volume.

## Surfaces And Runtimes

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-core` | Authenticated provider report, binding-derived HTTP transport, cross-domain official capability adapters and durable asynchronous job execution for admitted `ulvia.cms.*` contracts. |
| `@bernouy/cms-control` | Authenticated collection-backed admin host and shared selected-provider capability transport. |
| `@bernouy/cms-delivery` | Public pages, Bloc assets, binding runtime, auth, gateway calls and SEO. |
| `@bernouy/cms-server` | Production adapter composition, Mongo Core-job persistence and CMS Core/Control/Delivery startup. |
| `@bernouy/official-repository-server` | Production official repository startup with persistent staged publication and immutable reads. |
| `@bernouy/ulvia-cli` | Persistent local CMS development stack backed by MongoDB. |

See [workspace architecture](README.md) for dependency direction and
[repository and gateway flows](../providers/README.md) for runtime wiring.
