# Workspace Package Map

This inventory follows the package manifests under `packages/`. Public APIs are
the exact exports declared in each `package.json`; package-local `AGENTS.md`
files explain implementation invariants.

## Publication Policy

All workspace packages use the repository MIT license. Foundation, feature, and
surface packages are publishable libraries unless their manifest explicitly sets
`"private": true`. The CLI source package `@bernouy/ulvia-cli` stays private;
the release toolchain bundles it into the public `@cyaxis/ulvia` command-line
package without workspace dependencies.

Server composition roots are deployment units rather than reusable packages:
`@bernouy/cms-kernel-server`, `@bernouy/ulvia-provider-server` and
`@bernouy/official-repository-server` are private.
`packages/official-repository` has no package manifest; its authored artifacts
are admitted and served by the official repository runtime. A package being
publishable describes its intended boundary, not evidence that a release has
already been published to a registry.

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
| `@bernouy/logging` | Structured diagnostics, bounded attributes, central redaction, Node sinks and test loggers. |

## Features

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-content` | Provider-neutral Pages, routes, Blocs, settings, themes, metadata, structured data, indexing, sitemap snapshots, rendering and generic contribution inputs. |
| `@bernouy/cms-files` | Official provider implementation for namespaces, credentials, uploads, immutable files, private signatures and image representations. |
| `@bernouy/cms-repository` | Contract releases, provider manifests, site installations/selections, catalogues, authored collection admission, content projections, migrations and the explicit collection build toolchain. |
| `@bernouy/cms-gateway` | Authorized provider-neutral capability invocation, identities and streaming binary transport. |
| `@bernouy/cms-secrets` | Credential-scoped secret namespaces, metadata and lifecycle over an injected generic encrypted secret store. |
| `@bernouy/cms-emailer` | Provider-neutral outbound email delivery interface. |
| `@bernouy/cms-smtp-emailer` | SMTP-specific administration, secret-backed configuration and the official Nodemailer implementation. |
| `@bernouy/cms-auth` | Provider-owned accounts, local credentials, PATs, signed session tokens, account lifecycle and authentication email composition. It exposes no HTTP routes. |

Collection Pages are admitted resources. The Kernel mounts their shared route
registry, rendering and revisioned execution-plan activation alongside
site-owned Pages. There is no separate administration Page model, persistence
model or runtime.
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
the `ulvia.official` provider manifest and official collections. It has
no runtime adapters or routes. `@bernouy/official-repository-server` publishes
and serves admitted copies from a separate persistent volume.

## Surfaces And Runtimes

| Package | Responsibility |
| --- | --- |
| `@bernouy/ulvia-provider` | Authenticated provider report, binding-derived HTTP transport, cross-domain official capability adapters and durable asynchronous operation execution for admitted `ulvia.cms.*` contracts. |
| `@bernouy/cms-kernel` | Stateless HTTP mounting and Page presentation for site and contributed Pages, request-actor resolution and injected feature handlers. |
| `@bernouy/cms-kernel-server` | Stateless HTTP composition for one pre-provisioned instance, connected only by Provider URL and opaque instance access token. |
| `@bernouy/ulvia-provider-server` | Durable instance registry and credentials, instance-scoped persistence/auth/gateway/files, exact profile transitions and recovery, operator API and Ulvia Provider listener. |
| `@bernouy/official-repository-server` | Production official repository startup with persistent staged publication and immutable reads. |
| `@bernouy/ulvia-cli` | Persistent local repository/Provider/Kernel container stack, including idempotent instance provisioning. |

See [workspace architecture](README.md) for dependency direction and
[repository and gateway flows](../providers/README.md) for runtime wiring.
