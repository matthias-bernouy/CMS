# @bernouy/cms-repository

Feature-owned catalogue storage, publication, installation/selection workflows,
authored collection admission and build tooling.

The contract language lives in `@bernouy/ulvia-contracts`. Generic Provider models,
manifest admission, selection validation and read ports live in
`@bernouy/ulvia-providers`. This feature implements their mutation and persistence
boundaries. Reports remain observations, never authority to approve new releases.

## Layout

- `application/`: SDK definitions for the package’s public API families.
- `contracts/`: catalogue publication, write interface and memory/Mongo adapters.
- `providers/`: persistent stores, administrative workflows, discovery and upgrades.
- `collections/`: authored releases, resources, installation, projection and build tooling.
- `repository/`: namespaces, staged publication, storage and source preparation.
- `site-upgrades/`: durable release-switch intents and site write fencing.
- `repository-http/`: bounded client transport for Repository discovery.
- `exports/`: declared public entry points.

## Principal Public Entry Points

| Export | Current responsibility |
| --- | --- |
| `@bernouy/cms-repository` | Repository-owned collection release type |
| `@bernouy/ulvia-contracts` | Release parsing, admission, canonicalization, digests and mocks |
| `@bernouy/ulvia-contracts/schema` | Bounded schema vocabulary, parsing and value validation |
| `@bernouy/ulvia-contracts/bindings` | Explicit HTTP/MCP binding types, exposure selection, HTTP plans and pure scalar codecs |
| `@bernouy/ulvia-contracts/compatibility` | Release evolution and consumer-compatibility checks |
| `@bernouy/cms-repository/features/authoring` | `authoringFeature`, default execution and structural service ports |
| `@bernouy/cms-repository/features/repository` | `repositoryFeature`, default registry execution and structural service ports |
| `@bernouy/cms-repository/contracts/catalogue` | Mutable release catalogue and deterministic in-memory implementation |
| `@bernouy/cms-repository/contracts/mongo` | Mongo release artifacts and revisioned publication metadata |
| `@bernouy/ulvia-contracts/protocol` | Strict I-JSON parsing, canonicalization and freezing primitives |
| `@bernouy/ulvia-providers` | Manifest parsing, reference validation, admission and digest |
| `@bernouy/cms-repository/providers/catalogue` | Immutable manifest catalogue port and memory implementation |
| `@bernouy/ulvia-providers/compatibility` | Descriptive manifest changes and exact-digest approval requirements |
| `@bernouy/cms-repository/providers/installations` | Administrative preparation/approval lifecycle and revisioned memory store |
| `@bernouy/cms-repository/providers/selections` | Revisioned selection store, dependency source and reviewed upgrades |
| `@bernouy/cms-repository/providers/sources` | Exact remote manifest and contract-release sources used by provider discovery |
| `@bernouy/cms-repository/providers/http` | Provider repository HTTP route registration and bounded wire decoding |
| `@bernouy/cms-repository/providers/mongo` | Mongo manifest catalogue, installation and selection stores with revision-checked writes |
| `@bernouy/cms-repository/providers/management` | Provider installation and selection application services |
| `@bernouy/cms-repository/collections` | Authored release parsing, Light DOM structure, asset and requirement verification, bundle digests |
| `@bernouy/cms-repository/repository/authoring` | Instance-scoped collection, contract and Provider manifest preparations and exact account-authorized publication |
| `@bernouy/cms-repository/repository/authoring/build` | Shared authored contract, Markdown documentation and mock compiler used by the CMS and CLI |
| `@bernouy/cms-repository/collections/build` | Bun-based collection Bloc source validation and browser runtime compilation for authoring tools |
| `@bernouy/cms-repository/collections/installations` | Revisioned site installations, compatibility analysis and resource digests for reviewed exact release switches |
| `@bernouy/cms-repository/collections/content` | Projection of installed Blocs, text sources and themes into Content |
| `@bernouy/cms-repository/collections/assets` | Verified collection asset projection and reads |
| `@bernouy/cms-repository/collections/texts` | Collection text definition, locale and site-override composition |
| `@bernouy/cms-repository/collections/sources` | Exact remote collection-release sources and dependency fetching |
| `@bernouy/cms-repository/collections/http` | Collection repository HTTP route registration and bounded wire decoding |
| `@bernouy/cms-repository/collections/mongo` | Mongo collection catalogues and installation stores |
| `@bernouy/cms-repository/repository/publication` | Account-bound staged publication, pinned PAT client and registry/upload-store ports |
| `@bernouy/cms-repository/repository/publication/transport` | Bounded response reads and Repository URL validation without loading artifact clients |
| `@bernouy/cms-repository/repository/namespaces` | Account ownership, transfers, suspension, deletion fences and bounded namespace client |
| `@bernouy/cms-repository/repository/namespaces/mongo` | Durable namespace ownership and account quotas |
| `@bernouy/cms-repository/repository/capabilities` | Transport-independent registry capability service and injected ports |
| `@bernouy/ulvia-contracts/documentation` | Immutable Markdown metadata and verified document assets |
| `@bernouy/cms-repository/repository/search` | Bounded public resource search, inspection and injected embedding ports |
| `@bernouy/cms-repository/repository/search/filesystem` | Derived search index over immutable registry metadata |
| `@bernouy/cms-repository/repository/search/http` | Bounded remote search and inspection client |
| `@bernouy/cms-repository/upgrades` | Usage inventories, reviewed collection/contract plans, write fences and recovery |
| `@bernouy/cms-repository/upgrades/mongo` | Durable upgrade plans, intents and write fences |
| `@bernouy/cms-repository/repository/filesystem` | Reference immutable registry, streamed upload staging, local catalogues, yanks and download ports |
| `@bernouy/cms-repository/repository/filesystem/lock` | Native filesystem leases without loading artifact parsers or publication services |

`application/authoring/` authors `ulvia/cms.authoring`: schemas, grouped
capabilities and the feature definition. `docs/authoring/` holds the ordinary
Markdown sources scanned at build time. Runtime selection uses generated
metadata and an injected `AuthoringService`; importing definitions never
constructs a publisher, reads source files or starts preparation/publication.
Public connection, namespace inventory and publication DTOs derive from schemas;
private preparation records and ownership state retain their separate types.

Invalid source preparation returns a successful diagnostic result. Expected
publication recovery/evolution refusals retain their bounded public instructions;
other exceptions remain private. HTTP localization belongs to the Provider surface.

Use explicit domain subpaths for executable APIs. There are no compatibility
packages or wrappers under the former package names.

## Current scope

The package provides provider-domain workflows, catalogue and storage ports,
deterministic memory implementations, and Mongo release, manifest, installation
and selection stores. It also owns collection admission, repository sources,
revisioned site installations and text overrides. Its explicit
`collections/build` subpath owns the Bun-based authoring compiler without being
loaded by admission or the package root. The internal `repository-http/`
directory holds bounded HTTP reads shared by collection and provider sources;
catalogue parsing remains in each domain. Mongo contract release publication
rejects fixture assets until separate byte storage is available.
The registry capability service receives verified account context plus namespace,
registry and upload-store ports. Runtimes compose durable account ownership and
streamed staging, binding every upload stage to its account, namespace and
ownership revision. The reference filesystem adapter targets one shared local
root; multi-node deployments require an explicitly supported storage design.
Publication
creates bounded metadata first, streams each asset separately and only exposes
the immutable release after a final idempotent commit. The Mongo catalogues expose
revision tokens from publication metadata for selection planning. Gateway freshness
checks compare the selected site route’s mutable records and do not rescan the
global catalogues. Admission and graph planning validate artifacts and proposed
choices; they do not establish live readiness or certify provider behavior. Host
authorization and production snapshot consistency remain composition responsibilities.

See the [contract guide](../../platform/contracts/src/README.md) for release evolution, schema
and transport profiles and dependency requirements. The
[provider guide](src/providers/README.md) explains immutable claims, site state
and the implemented V1 connection protocol. [Provider workflows](src/providers/workflows.md)
details implemented transitions, upgrade boundaries and remaining runtime work.
The [collections guide](src/collections/README.md) documents admitted themes,
texts, examples, assets and resource requirements. The installed
collection path accepts verified assets and capability requirements. The CLI
runtime composes a private filesystem release cache and explicit publication
clients; the Provider runtime composes the CMS-hosted Registry. This feature
owns authenticated publication, exact release transfer and reversible yanking.
Static Page capability analysis belongs to `@bernouy/cms-content/public-delivery`,
but no provider invocation occurs inside this package. Collection Bloc runtime compilation is
implemented for trusted CLI sources; third-party JavaScript isolation remains a
separate concern.
[AGENTS.md](AGENTS.md) defines the domain
boundaries and implementation invariants.

The `repository/filesystem` adapter runs on Bun. Its process locks use an empty
exclusive transaction in Bun's bundled SQLite library, without storing business
data in SQLite or requiring an external `flock` executable. Lock files remain in
place on release so contenders always lock the same inode; process death releases
the native lock immediately. This adapter targets local filesystem storage, not
shared multi-replica network storage.

Upload creation resumes an identical account/namespace/revision-bound manifest
through a derived SHA-256 pointer. Expiration cleanup visits at most eight queued
sessions per invocation and persists its position; committed history is not
parsed during cleanup. Active asset transfers and commits hold the same upload
lock. Closing the upload store waits for pending maintenance.

`application/registry/` authors the 22-capability `ulvia/repository` API. The
feature calls typed `RepositoryCapabilityService` groups (`reads`, `namespaces`,
`sources`, `publications`); public search, catalogue, namespace, source and upload
receipt DTOs derive from schemas. Its injected account resolver receives verified
Provider context, while the domain services enforce active accounts, namespace
ownership revisions and upload ownership even for direct calls.

The Provider selects this implementation only for an explicit Repository profile.
It supplies account alias resolution and localized errors; the runtime constructs
the filesystem/Mongo adapters. Downloads preserve immutable headers and stream
through admitted byte limits. Build-only scans discover `docs/repository/`;
runtime mounting uses generated metadata without reading Markdown.
