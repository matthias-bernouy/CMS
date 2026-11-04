# @bernouy/cms-repository

CMS repository formats, admission rules and pure validation in one feature
package. The contracts domain defines provider-neutral releases; the providers
domain defines immutable manifests and separate CMS-owned
installation, runtime-report and contract-selection models. The collections
domain starts with authored bundles, assets and Light DOM compositions.

Contract releases and provider manifests are immutable, versioned publications.
Installations and selections are state for a particular site, with exact pins to
those publications. Runtime reports are observations of a provider, never an
authority to change an approved manifest, gateway permissions or site selections.

## Layout

The package separates `contracts/`, `providers/`, `collections/`, `repository/`
and `upgrades/`. `repository/` owns publication, account namespace authority,
resource discovery and filesystem storage; it is not an executable HTTP server.
`repository-http/` holds bounded client reads. `exports/` defines the public
facades. Tests and fixtures follow their owning domains. Consult `package.json`
for the complete current export map rather than treating this overview as an
exhaustive directory listing.

Contracts do not depend on providers or installation state. Providers consume
the contracts export facade. Collections consume that same facade without
depending on providers. Their authored-bundle admission is not renderer
compilation, site installation or execution authorization.

## Principal Public Entry Points

| Export | Current responsibility |
| --- | --- |
| `@bernouy/cms-repository` | Type-only entry point for principal domain models |
| `@bernouy/cms-repository/contracts` | Release parsing, admission, canonicalization, digests and mocks |
| `@bernouy/cms-repository/contracts/schema` | Bounded schema vocabulary, parsing and value validation |
| `@bernouy/cms-repository/contracts/bindings` | Explicit HTTP/MCP binding types, exposure selection, HTTP plans and pure scalar codecs |
| `@bernouy/cms-repository/contracts/compatibility` | Release evolution and consumer-compatibility checks |
| `@bernouy/cms-repository/contracts/catalogue` | Release catalogue port and deterministic in-memory implementation |
| `@bernouy/cms-repository/contracts/mongo` | Mongo release artifacts and revisioned publication metadata |
| `@bernouy/cms-repository/contracts/protocol` | Strict I-JSON parsing, canonicalization and freezing primitives |
| `@bernouy/cms-repository/providers` | Manifest parsing, reference validation, admission and digest |
| `@bernouy/cms-repository/providers/catalogue` | Immutable manifest catalogue port and memory implementation |
| `@bernouy/cms-repository/providers/compatibility` | Descriptive manifest changes and exact-digest approval requirements |
| `@bernouy/cms-repository/providers/installations` | Parsers, local preparation/approval lifecycle, observations, readiness and revisioned memory store |
| `@bernouy/cms-repository/providers/selections` | Bounded full-site graph planning, revisioned memory store and catalogue dependency source |
| `@bernouy/cms-repository/providers/sources` | Exact remote manifest and contract-release sources used by provider discovery |
| `@bernouy/cms-repository/providers/http` | Provider repository HTTP route registration and bounded wire decoding |
| `@bernouy/cms-repository/providers/mongo` | Mongo manifest catalogue, installation and selection stores with revision-checked writes |
| `@bernouy/cms-repository/providers/management` | Provider installation and selection application services |
| `@bernouy/cms-repository/collections` | Authored release parsing, Light DOM structure, asset and requirement verification, bundle digests |
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
| `@bernouy/cms-repository/contracts/documentation` | Immutable Markdown metadata and verified document assets |
| `@bernouy/cms-repository/repository/search` | Bounded public resource search, inspection and injected embedding ports |
| `@bernouy/cms-repository/repository/search/filesystem` | Derived search index over immutable registry metadata |
| `@bernouy/cms-repository/repository/search/http` | Bounded remote search and inspection client |
| `@bernouy/cms-repository/upgrades` | Usage inventories, reviewed collection/contract plans, write fences and recovery |
| `@bernouy/cms-repository/upgrades/mongo` | Durable upgrade plans, intents and write fences |
| `@bernouy/cms-repository/repository/filesystem` | Reference immutable registry, streamed upload staging, local catalogues, yanks and download ports |
| `@bernouy/cms-repository/repository/filesystem/lock` | Native filesystem leases without loading artifact parsers or publication services |

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

See the [contract guide](src/contracts/README.md) for release evolution, schema
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
