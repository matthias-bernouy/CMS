# Workspace Package Map

This inventory follows the package manifests under `packages/`. Public APIs are
the exact exports declared in each `package.json`; package-local `AGENTS.md`
files explain implementation invariants.

## Publication Policy

All workspace packages use the repository MIT license. Foundation, Platform, feature, and
surface packages are publishable libraries unless their manifest explicitly sets
`"private": true`. The CLI source package `@bernouy/ulvia-cli` stays private;
the release toolchain bundles it into the public `@cyaxis/ulvia` command-line
package without workspace dependencies.

Server composition roots are deployment units rather than reusable packages:
`@bernouy/cms-edge-server` and `@bernouy/ulvia-provider-server` are private.
`packages/official-repository` has no package manifest; its authored artifacts
are admitted into the Provider snapshot and explicitly published to CMS Repository instances. A package being
publishable describes its intended boundary, not evidence that a release has
already been published to a registry.

## Foundation

| Package | Responsibility |
| --- | --- |
| `@bernouy/binary-media` | Immutable binary snapshots, SHA-256 identities, representation fingerprints and bounded media signature inspection. |
| `@bernouy/blob-store` | Stream-first opaque blob contracts with memory, local-filesystem and S3-compatible adapters. |
| `@bernouy/http-runner` | Runner abstractions, Bun HTTP serving, cache, compression, CSP and test helpers. |
| `@bernouy/envelope-crypto` | Envelope encryption, KEK/DEK contracts and Mongo DEK storage. |
| `@bernouy/resource-identity` | Bounded qualified resource identities and collision-free CSS-safe ownership prefixes. |
| `@bernouy/rate-limiter` | Fixed-window rate limiting with memory and Mongo implementations. |
| `@bernouy/secret-store` | Secret storage, reference resolution and encrypted Mongo persistence. |
| `@bernouy/image-processing` | Generic image inspection and WebP transforms used by Files provider implementations. |
| `@bernouy/text-search` | Backend-independent BM25, vector similarity, rank fusion, vector preparation/cache and abstract embedding ports. |
| `@bernouy/text-embeddings` | Explicit local E5/ONNX subprocess adapter with native telemetry disabled; owns Transformers.js and its native dependencies. |
| `@bernouy/logging` | Structured diagnostics, bounded attributes, central redaction, Node sinks and test loggers. |

## Platform

| Directory | Package | Responsibility |
| --- | --- | --- |
| `platform/contracts` | `@bernouy/ulvia-contracts` | Contract schemas, parsing, validation, admission, bindings, compatibility and release read ports. |
| `platform/providers` | `@bernouy/ulvia-providers` | Manifest admission, Provider execution models, selection validation, readiness and read ports. |
| `platform/gateway` | `@bernouy/cms-gateway` | Authorized generic capability invocation, HTTP/MCP transports, Provider SDK, authority, identities and audit. |
| `platform/sdk` | `@bernouy/ulvia-sdk` | Typed operations/contracts, static Provider assembly, generated manifests and an explicit Gateway HTTP receiver adapter; standalone. |

Platform depends only on Platform and Foundation. Catalogue publication, installation
approval and selection replacement remain feature-owned. Edge and the official
Provider remain surfaces; documentation search remains a feature.

## Features

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-documentation` | Selection-bound Markdown retrieval and hybrid lexical/semantic search, with explicit runtime adapters for multilingual embeddings and derived Mongo vectors. |
| `@bernouy/cms-content` | Provider-neutral Pages, routes, Blocs, settings, themes, metadata, structured data, indexing, sitemap snapshots, rendering and generic contribution inputs. |
| `@bernouy/cms-observability` | Instance-scoped journal validation, bounded collection, query and retention services; explicit memory and Mongo adapters. |
| `@bernouy/cms-files` | Official provider implementation for namespaces, credentials, uploads, immutable files, private signatures and image representations. |
| `@bernouy/cms-repository` | Persistent release catalogues, publication, installation/selection workflows, authored collection admission, content projections, upgrades and build tooling. |
| `@bernouy/cms-secrets` | Credential-scoped secret namespaces, metadata and lifecycle over an injected generic encrypted secret store. |
| `@bernouy/cms-emailer` | Provider-neutral outbound email delivery interface. |
| `@bernouy/cms-smtp-emailer` | SMTP-specific administration, secret-backed configuration and the official Nodemailer implementation. |
| `@bernouy/cms-auth` | Provider-owned accounts, local credentials, PATs, persistent opaque sessions, account lifecycle and authentication email composition. It exposes no HTTP routes. |

Collections own reusable examples, not live Pages or routes. Runtime profiles
may copy selected examples into ordinary Content Pages once during provisioning.
Content owns their route registry, rendering, access analysis and sitemap; Edge
forwards native resources. Administration uses the same Page model and runtime.
Collection Bloc compilation is available only through the explicit
`@bernouy/cms-repository/collections/build` tooling subpath. Site-owned Bloc
source serialization remains in `cms-content` because it publishes mutable CMS
content rather than an immutable collection release.

The old `cms-sources`, `cms-source-images` and `cms-identities` packages are
absent. Provider invocation and identities belong to Gateway; file and image
semantics belong to Files providers; generic binary inspection, encrypted value
storage and image processing belong to Foundation.
Declarative reads use `cms-query`; native form commands use `cms-mutation`.
The removed `cms-source` transport grammar is not accepted.

## Official Products

`packages/official-repository` contains the authored official contract releases,
the `ulvia` provider manifest and official collections. It has
no runtime adapters or routes. The official Provider implements Registry operations
for explicitly enabled CMS instances, exposed through their independent Edge.

## Surfaces And Runtimes

| Package | Responsibility |
| --- | --- |
| `@bernouy/ulvia-provider` | Authenticated provider report, binding-derived HTTP transport, cross-domain official capability adapters and durable asynchronous operation execution for admitted `ulvia/cms.*` contracts. |
| `@bernouy/cms-edge` | Stateless HTTP protocols, request-actor resolution, public resource streaming and final security/cache policy. |
| `@bernouy/cms-edge-server` | Stateless HTTP composition for one pre-provisioned instance, connected only by Provider URL and opaque instance access token. |
| `@bernouy/ulvia-provider-server` | Durable instance registry and credentials, instance-scoped persistence/auth/gateway/files, exact profile transitions and recovery, operator API and Ulvia Provider listener. |
| `@bernouy/ulvia-cli` | Persistent local release cache and Provider/Edge container stack, including idempotent instance provisioning. |

See [workspace architecture](README.md) for dependency direction and
[repository and gateway flows](../providers/README.md) for runtime wiring.
