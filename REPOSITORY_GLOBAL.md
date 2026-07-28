# Global Integration Repository Plan

> Historical implementation plan. The implemented runtime contract now
> requires exactly one global repository URL, has no embedded or loopback read
> mode, and mounts the anonymous repository facade only on the designated
> repository-management CMS. The public `/integrations` UI is deployed from
> `packages/resources/sites/cms-repository-hub`; obsolete embedded, mirrored,
> and programmatic page-provider steps below are retained only as design
> history and must not be used as current deployment instructions.

## Status

This document defines the target architecture and delivery plan for a global,
versioned integration repository. It is a design plan, not a description of
already implemented behavior.

The first deliverable is deliberately consumer-first: a CMS must be able to
install and rerun an integration that exists only in a remote, read-only
repository before the mutable registry, dedicated image, or management console
is introduced.

## Goals

- Provide one global source of truth for integration definitions and their
  complete version packages.
- Make catalog metadata, definitions, assets, and exact version packages
  publicly readable without credentials.
- Build the public integration catalog with the Delivery surface of one
  management CMS instance.
- Allow only administrators of that CMS to publish integrations, manage
  versions, and promote stable releases.
- Make every published `(kind, version)` immutable.
- Prevent a minor or patch release from weakening its declared backwards
  compatibility contract.
- Pin installations and reruns to the exact definition and package originally
  selected.
- Keep reruns operational from durable local cache while the global repository
  is unavailable.
- Publish new official integrations through the same validation and publication
  path as third-party integrations.
- Preserve the workspace dependency direction:
  `runtimes -> surfaces -> resources -> features -> foundation`.

## Non-goals For The MVP

- Public or browser-direct access to repository management operations.
- User and role management inside the repository service.
- Mutable or forced replacement of an existing version.
- MongoDB, S3, or another remote persistence adapter for the registry.
- Automatic reconciliation of image-bundled resources into an existing
  registry volume.
- Version yanking, arbitrary release channels, or promotion workflows beyond
  explicit `stable`/`latest` management.
- Automatic cache garbage collection in Lot 0.

## Current State And Constraints

The workspace currently has:

- a versioned filesystem catalog with `stable`, `latest`, and `versions`;
- cross-validation between an index entry and its definition;
- traversal and symlink protection for existing definition resolution;
- fragmented definition bundle resolution;
- limits of 32 levels, 4,096 files, and 16 MiB for definition bundles;
- a read-only `RepositoryCms` HTTP surface;
- an HTTP definition repository client;
- a CMS integration management UI for browsing, installing, and rerunning
  catalog integrations.

The current implementation does not yet provide:

- a full version-package endpoint;
- a generic bounded version-package reader;
- durable package materialization;
- correct remote deployment of SQL schemas and Edge Functions;
- a write-side registry or management API;
- a repository runtime or image;
- an in-memory catalog snapshot, quarantine, or publication recovery;
- dependency version constraints;
- a public repository catalog built with CMS Delivery;
- a repository publication and version-management console.

Several correctness and scalability defects must be fixed before adding package
publication:

- the read API has no stable public catalog origin or public browsing UI;
- connector deployment reads files from `OFFICIAL_INTEGRATIONS_ROOT` even when
  definitions come from a remote repository;
- rerun resolves the default repository channel when no version is supplied,
  instead of resolving the installed version;
- the remotely resolved definition wins over `definitionSnapshot` and can
  silently change the installed version during a rerun;
- the filesystem definition repository rescans the full catalog for each
  request and one invalid package can fail the whole catalog.

## Architectural Principles

### The CMS Is The Public Catalog And Management Gateway

Repository reads are public and anonymous. The management CMS:

- renders the public catalog through CMS Delivery;
- exposes a same-origin public read API suitable for browsers, CLI tools, and
  other CMS consumers;
- authenticates the administrator;
- enforces the initial exact-admin authorization rule;
- stores the management service credential;
- exposes publication, compatibility, and version-management workflows through
  CMS Control;
- proxies only approved management operations to the internal write surface.

The browser may call the public read API and download complete package contents,
including SQL and Edge Function sources. It never receives the management token
or access to the management surface. Granular CMS permissions can replace the
exact-admin rule later without changing the repository protocol.

### Read And Write Dependency Closures Stay Separate

Write-side registry code must not be added to `@bernouy/cms-integrations`.
That package already has eight immediate entries in both `src/core` and
`src/default-implementation`; adding a ninth entry would also violate the
workspace fanout policy.

Separating write packages additionally prevents every consuming CMS from
pulling publication locks, recovery, quarantine, and mutable filesystem
adapters into its dependency closure.

### Consumption Is Proven Before Publication

Lot 0 uses the current read-only filesystem repository to prove the complete
remote consumption path. A mutable registry that can publish packages is not
useful until a CMS can install and redeploy those packages correctly.

### Versions And Content Are Immutable

`(kind, version)` identifies immutable package content. A publication for an
existing version returns `409 Conflict`, including when the submitted digest is
identical. There is no force or overwrite mode.

## Package Topology

The architecture uses six workspace packages plus one deployable image.

### Feature Packages

1. `@bernouy/cms-integrations`

   Existing definition, installation, dependency, import, connector, and
   provisioning contracts. It remains the owner of installation semantics and
   gains the declarative connector compatibility contracts.

2. `@bernouy/cms-integration-packages`

   New package owning the package envelope, canonicalization, digest,
   validation, package reader contracts, HTTP client, content-addressed cache,
   and filesystem materializer. Its root export stays adapter-light; HTTP and
   filesystem implementations use explicit subpaths.

3. `@bernouy/cms-integration-registry`

   New write-side feature owning immutable publication, locks, registry index
   mutation, recovery, quarantine, and filesystem registry adapters. It depends
   only on published exports from the integration and package feature packages.

### Surface Packages

4. `@bernouy/cms-repository`

   Existing read-only surface. It serves catalog metadata, definitions, assets,
   and exact version packages through injected repositories.

5. `@bernouy/cms-repository-management`

   New management surface. It exposes publication and later operational
   endpoints through an injected integration registry. Read-only CMS instances
   do not depend on it.

### Runtime Package

6. `@bernouy/cms-repository-server`

   New composition root. It reads environment, constructs filesystem adapters,
   builds the catalog snapshot, mounts public read and internal management
   surfaces, applies management-token authentication, and starts the listeners.

### Resource And Image

- `@bernouy/cms-official-integrations` remains a resources-layer package.
- `infra/images/cms-repository` builds and deploys the repository runtime.

## Version Package Protocol

### Envelope

Version packages use deterministic JSON rather than `tar.gz`. An archive format
would introduce extraction-only risks such as archive traversal, symlink
entries, misleading declared sizes, and decompression bombs.

The version root is represented as:

```json
{
  "schema": "cms.integration.package.v1",
  "kind": "commerce",
  "version": "1.0.0",
  "definition": "definition.json",
  "releaseNotes": "release-notes.md",
  "files": {
    "definition.json": {
      "encoding": "utf8",
      "content": "{...}"
    },
    "release-notes.md": {
      "encoding": "utf8",
      "content": "## Changes\n\n..."
    },
    "assets/icon.png": {
      "encoding": "base64",
      "content": "..."
    }
  }
}
```

The current official catalog is textual, but `utf8 | base64` is part of v1
because asset contracts permit binary files.

The package contains paths relative to one version root. It does not contain
the catalog-level `integration.json`. The `definition` field identifies the
entry definition within the transported version root.

`releaseNotes` identifies a UTF-8 Markdown file in `files`. It is required for
new management API publications and may be absent only for legacy packages
imported during initial bootstrap. The referenced path follows the same path
rules as every package file, its decoded bytes count towards package limits, and
its content is immutable and covered by the package digest. Public renderers
disable raw HTML and sanitize generated markup.

### Canonical Digest

The repository:

- parses and validates the submitted envelope;
- serializes it with the
  [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785);
- preserves string contents exactly without Unicode content normalization;
- encodes the canonical document as UTF-8;
- computes SHA-256 over those bytes.

RFC 8785 fixes recursive property ordering, primitive serialization, and string
escaping for every producer and consumer. In particular, canonical JSON has no
BOM or insignificant whitespace, does not escape `/`, emits non-control Unicode
characters literally, uses the RFC-defined lowercase control escapes, and
rejects lone surrogates and other input outside the I-JSON constraints. Object
properties, including file paths, are ordered by raw UTF-16 code units as
required by JCS. The repository, CMS, CLI, and any browser packer use the shared
canonicalizer from `@bernouy/cms-integration-packages`; they do not rely on an
independent encoder.

The digest is returned out of band in the package response metadata and stored
as a lowercase hexadecimal SHA-256 identifier. A submitted digest is advisory;
the repository and every consumer recompute it.

### Limits

The default v1 limits are:

- maximum path depth: 32;
- maximum files: 4,096;
- maximum total decoded file bytes: 16 MiB;
- maximum request body: 32 MiB;
- bounded path and segment lengths;
- only regular files;
- no empty, absolute, dot, dot-dot, backslash, NUL, or duplicate normalized
  paths.

The HTTP body limit is enforced against both declared `Content-Length` and
bytes actually read. Compressed management request bodies are rejected in v1.
Clients also cap decoded response bytes.

### Filesystem Reader

The generic package reader:

- resolves the version root canonically;
- rejects a symlink repository root, symlink entries, and special files;
- checks every canonical path remains inside the version root;
- walks in deterministic lexical order;
- enforces depth, file-count, per-path, and total-byte limits while reading;
- chooses `utf8` only for valid textual content and `base64` otherwise;
- returns the validated envelope and recomputed digest.

Existing walkers for catalog discovery, bloc sources, and Supabase functions
remain specialized and are not reused as the generic package reader.

## SemVer And Dependencies

Repository versions must be valid SemVer 2.0 exact versions. The general
`IntegrationDefinition.version` field may remain optional for local or legacy
definitions, but a repository package requires it and it must match both the
package envelope and catalog index.

`IntegrationDependency` gains an optional `versionRange` field. Keeping it
optional preserves existing definitions and stored `definitionSnapshot`
documents.

The accepted range syntax is intentionally limited and documented:

- exact versions;
- caret ranges;
- tilde ranges;
- bounded comparator intersections such as `>=1.2.0 <2.0.0`.

A maintained SemVer implementation evaluates versions and ranges. CmsCore does
not implement range semantics itself. Unsupported syntaxes are rejected.
Prerelease versions are never selected implicitly by a stable default.

Range syntax is validated while parsing a definition. Dependency satisfaction
is enforced when resolving an installation or explicit upgrade. Write
publication must not be enabled before multi-version dependency constraints are
enforced.

## Backwards Compatibility Gate

SemVer syntax alone does not prove that a release uses the correct increment.
Candidate planning compares the package with the relevant published baselines
in the same major line and produces an immutable compatibility V2 root. Final
activation is governed by the composite release-admission decision that
references that exact report and the other required evidence.

The release rules are:

- patch: no public contract removal, renaming, narrowing, or new required
  behavior;
- minor: additive and optional public contract changes only;
- major: breaking or otherwise unproven changes are allowed;
- breaking or `unknown` compatibility in a minor or patch candidate produces
  `contractAdmissible: false`; the composite decision refuses activation and a
  major increment is required;
- no administrator override may publish a known breaking or contract-unknown
  change under a minor or patch number.

The declarative comparator covers at least:

- removed or renamed artifacts, blocs, sources, endpoints, functions, triggers,
  relations, dashboards, roles, and permissions;
- new required inputs, answers, headers, secrets, or dependency bindings;
- removed response fields, changed types, narrowed enums, and newly restrictive
  validation;
- dependency ranges that exclude previously supported versions;
- declared database schema ownership, types, nullability, defaults, and public
  constraints.

Compatibility classifies public contracts, not implementation byte equality.
Changing a SQL migration, stored procedure body, or Edge Function source is not
by itself `unknown` and does not require a major version when the extracted or
declared public contract remains compatible.

For SQL-backed connectors, the compared contract is declared rather than
inferred from arbitrary SQL. `DeclarativeConnectorTemplate` gains an optional
`compatibility.schema` manifest containing the owned namespaces, relations,
columns, normalized provider types, nullability, compatible defaults, and
public primary-key, unique, foreign-key, and check constraints. The field
remains optional while parsing legacy definitions and stored snapshots, but the
management API requires it for every new package that deploys SQL schemas.

The MVP does not add a PostgreSQL parser, execute uploaded migrations, or try to
reconstruct a resulting schema from SQL source. The comparator operates on two
validated declarations, making its evidence deterministic and auditable. SQL
source changes with an unchanged declaration are implementation changes and
remain eligible for a patch release.

The declared database compatibility rules include:

- adding a table, nullable column, column with a compatible default, or
  non-restrictive public capability is additive;
- removing or renaming a table or column, narrowing a type, adding a required
  column without a compatible default, or tightening a public constraint is
  breaking.

Declaration consistency is a separate package-validity concern. A trusted CI
job may apply official migrations to an isolated PostgreSQL instance, inspect
the resulting owned schema, and attach verifiable evidence to the publication.
A detected contradiction between SQL and its declaration rejects the package
as invalid regardless of its major version. A detected contract-affecting SQL
operation that cannot be reconciled with a complete declaration is
contract-level `unknown`; minor and patch publication fail closed. The registry
does not execute untrusted SQL as part of a management request.

Bootstrapped official versions may predate `compatibility.schema`. For those
versions only, bootstrap may import a reviewed normalized baseline contract
bound to the immutable package digest and record its CI provenance without
rewriting the package. This is registry metadata, not a mutable replacement for
the package definition. If no such baseline exists, a later minor or patch SQL
release is contract-level `unknown` and is rejected; a new major line or a
trusted baseline backfill is required before compatible-line publication can
resume. The normal management API cannot attach or replace baseline contracts
after publication.

For HTTP functions, the compared contract includes routes, methods, required
inputs and headers, declared response shapes, status semantics, and required
secrets. Internal control flow and implementation-only source changes are not
part of the SemVer contract.

`unknown` is reserved for a public contract surface that changed but cannot be
compared reliably, for example dynamically constructed schema operations,
missing or contradictory function contract metadata, or an unparseable
contract-affecting declaration. A trusted compatibility test suite may provide
verifiable evidence for such a surface. The MVP fails closed only for this
contract-level uncertainty: `unknown` requires a major version.

The report records the compared baselines, detected changes, evidence, outcome,
and required release level. It is visible in the public catalog and in the
administrator publication workflow. Only a successfully validated publication
may advance `latest`; promotion to `stable` is a separate administrator action.

Compatibility evidence starts with an immutable
`cms.integration.compatibility-report.v2` root. It records a stable report ID,
`revisionType: "root"`, origin, evaluator name and version, creation time,
package digest, baseline digests, normalized findings, assessment, and
provenance. Comparator improvements never rewrite that root.

A later evaluation appends a V2 revision with its own provenance and an explicit
`supersedes` reference. The authoritative admission verdict is a separate,
append-only composite `ReleaseAdmissionDecision`: it digest-binds the exact
current compatibility, verification, required migration, stateful-change, and
policy evidence. Neither history rewrites an earlier root or revision.

Stable promotion supplies the current composite decision revision ID as its
evidence reference. The registry loads and digest-validates that exact current
decision, requires it to be admissible, and records its ID and digest in the
promotion record. A later adverse reassessment appends both the compatibility
and reconciled composite-decision revisions; a durable eligibility operation
then marks the version inadmissible and repairs `stable` and `latest` to the
newest remaining installable versions. The channel change is therefore explicit
and recoverable rather than a silent demotion.

The first version of a kind has no comparison baseline. Its V2 root persists
`baselines: []`, a `not-applicable` outcome, and a `new-kind` reason. The first
version of a new major line similarly has no enforcing same-major baseline and
uses a `new-major` reason; it may retain the previous `stable` version as an
informational baseline, but that comparison does not make the new-major
compatibility assessment inadmissible.

## Public Repository Read Contract

All repository read routes are public and anonymous. No read token, loopback
credential, browser credential, or `P9R_INTEGRATION_REPOSITORY_TOKEN` exists.
Public access intentionally includes complete definitions, assets, SQL,
Edge Function sources, and downloadable exact version packages.

The management CMS exposes the canonical public origin:

```text
https://integrations.example.com/.cms/repository/*
```

CMS Delivery serves the public catalog on the same origin. Repository routes
are mounted on the Delivery runner, never as an anonymous exception on the
Control runner. In embedded mode, Delivery mounts `RepositoryCms` directly
under `/.cms/repository`; the CMS loopback client uses `DELIVERY_PORT`. In
global mode, the same Delivery path forwards only `GET` and `HEAD` operations
to the repository read surface. Management routes are not routed through that
public origin.

Read responses use public HTTP caching:

- exact version definitions, assets, and packages:
  `Cache-Control: public, max-age=31536000, immutable`;
- exact release notes use the same immutable cache contract;
- catalog summaries, indexes, version lists, and channel-resolved definitions:
  short public cache lifetimes with `ETag` revalidation;
- compatibility history uses a short public lifetime and an `ETag` that changes
  only when an append-only report revision is added;
- package and exact-definition ETags derive from immutable content digests;
- public `GET` and `HEAD` responses permit cross-origin reads with
  `Access-Control-Allow-Origin: *`.

HTTP caching reduces public bandwidth, but it does not replace the CMS durable
package cache required for offline reruns.

Public package downloads also have an origin-protection policy:

- CMS Delivery applies a configurable fixed-window limit to
  `GET /api/integrations/package` before an upstream fetch or filesystem walk;
- the limit is keyed by a generic HTTP client-address resolver from
  `@bernouy/http-runner`, independent of analytics configuration;
- production composition uses the existing `MongoRateLimiter` from
  `@bernouy/rate-limiter/mongo` with a dedicated namespace, while local
  single-process development may use `InMemoryRateLimiter`;
- rejected downloads return `429 Too Many Requests` and `Retry-After`;
- catalog metadata, `HEAD`, and small exact-definition requests remain
  anonymous without consuming the package-download budget;
- package-backed `HEAD` and release-note reads use a separate metadata quota
  before package-source traversal, so their exemption cannot be used to force
  unbounded filesystem walks.

Client-address resolution has an explicit runtime mode:

- `direct` ignores forwarding headers and uses the TCP peer recorded by
  `getRequestIP`;
- `trusted-proxy` requires a positive trusted-hop count, builds the hop chain
  from `X-Forwarded-For` followed by the recorded TCP peer, removes that trusted
  suffix from the right, and selects and canonically normalizes the preceding
  IPv4 or IPv6 address;
- `disabled` returns no rate-limit key and disables only this public download
  limiter with a structured warning and metric.

Loopback peers are resolved directly to a dedicated loopback key before
trusted-proxy chain validation, so the CMS HTTP loopback client remains
functional without forging forwarding headers or sharing the external proxy
budget.

The runtime maps these modes from `CMS_HTTP_CLIENT_ADDRESS_MODE` and
`CMS_HTTP_TRUSTED_PROXY_HOPS`; the configuration-safe default is `disabled`.
The standard Compose deployment explicitly selects `trusted-proxy` with one
trusted hop because `nginx-proxy` is its only public ingress hop. The configured
count is the complete trusted ingress suffix, including every CDN or reverse
proxy that appends or overwrites the forwarding chain. Adding a CDN in front of
the standard proxy therefore changes the count from one to two and requires a
configuration update. Local development selects `direct`.

Forwarding headers are never trusted implicitly, and this policy is separate
from `ANALYTICS_TRUST_PROXY`. A non-loopback request with an invalid or
insufficient forwarding chain returns `400 Bad Request` with the public code
`invalid_forwarded_chain` before rate-limit accounting, upstream fetching, or
filesystem traversal.

When no trustworthy client-address mode is configured, the limiter is disabled
instead of silently placing every user and CMS consumer behind one small global
quota. This default is an accepted residual abuse and bandwidth risk for manual
deployments. It emits an operational warning and metric but does not fail
readiness; the operator must configure direct or trusted-proxy mode or provide
equivalent limiting at the ingress.

An ingress cache or CDN is recommended for immutable exact resources, but the
MVP capacity and abuse model does not assume one exists. Adding a CDN requires
incrementing `CMS_HTTP_TRUSTED_PROXY_HOPS` for that extra trusted public hop and
verifying its forwarding-header behavior. Direct public exposure of the
repository read listener is allowed only behind equivalent cache, request-size,
rate-limit, and trusted-client-address controls; it must not bypass the Delivery
policy.

## Repository Client Error Contract

Repository client failures use typed errors with a stable status and public
error code:

- transport failure, timeout, upstream `429`, or upstream `5xx`:
  `503 Service Unavailable`;
- invalid upstream JSON, schema, identity, version, or digest:
  `502 Bad Gateway`;
- exact package or definition not found:
  existing nullable or `404` behavior.

Requests have a bounded configurable timeout. Internal topology and raw
upstream response bodies are not exposed in public errors.

CMS integration pages render repository unavailability explicitly instead of
surfacing an opaque `500`. Delivery startup and delivery requests do not
require the remote repository.

## Accepted Embedded Repository Scan Debt

Lot 1 removes per-request catalog rescans in the standalone global repository,
but it does not change `FsIntegrationDefinitionRepository` inside existing CMS
instances. The embedded repository continues to scan its small official catalog
for definition lookups, and the package endpoint walks one exact version tree
on a cache miss.

This is accepted in Lot 0 because the embedded catalog contains only a small
number of packages, exact package retrieval occurs once per digest before
durable caching, remote mode bypasses the embedded read path except for legacy
fallback, and optimizing it is not required to prove remote consumption.
Repository snapshotting in Lot 1 must not be described as eliminating this CMS
debt. The embedded path can receive separate memoization if measurements justify
it, or disappear from production once the global repository becomes mandatory.

## Installation, Rerun, And Upgrade Semantics

### Installation Pin

An installation records:

- `definitionVersion`;
- `definitionSnapshot`;
- optional `packageDigest`.

New installations resolve an exact version, download and verify its package,
materialize it durably, and persist the digest only as part of the successful
installation commit.

### Rerun

A rerun is not an upgrade.

By default it:

- uses `definitionSnapshot` as the definition authority;
- resolves exactly `definitionVersion` when repository access is needed;
- resolves exactly `packageDigest` when present;
- never follows `stable` or `latest`;
- never changes version, snapshot, or digest.

A different version supplied to the rerun endpoint is rejected with an explicit
instruction to use the upgrade action.

### Explicit Upgrade

Upgrade is a separate action. It:

- resolves an explicitly requested target version;
- validates dependency ranges;
- downloads, verifies, and durably materializes the target package;
- deploys using the target definition and package root;
- replaces version, snapshot, and digest only after the complete operation
  succeeds;
- leaves the previous pin unchanged after failure.

### Legacy Installations

For an installation without `packageDigest`, the resolver:

1. uses `definitionSnapshot` when present;
2. requests the exact stored `definitionVersion`, never a channel;
3. checks the durable cache;
4. checks the remote exact package;
5. falls back to the embedded exact version root;
6. computes and persists a first digest after successful materialization.

If the historical exact package cannot be reconstructed, connector rerun fails
explicitly. It must not silently substitute another version. Legacy
`unversioned` installations retain their snapshot behavior but receive no false
cryptographic provenance.

## Durable CMS Package Cache

### Storage Contract

The production CMS gets a dedicated writable bind mount:

```yaml
environment:
    CMS_INTEGRATION_PACKAGE_CACHE_DIR: /var/lib/cms/integration-packages

volumes:
    - ./files:/var/lib/cms/files
    - ./integration-packages:/var/lib/cms/integration-packages

read_only: true
tmpfs:
    - /tmp:rw,nosuid,nodev,noexec,size=256m
```

The cache must not use the read-only image filesystem, the embedded package
root, `/tmp`, or the CMS media root. A hidden media subdirectory would currently
be ignored by media reconciliation, but a separate mount gives storage,
permissions, backup, and lifecycle isolation without depending on another
package's scanning behavior.

The CMS image creates both mount points for the `bun` user. Deployment
instructions create both host directories with the container UID/GID and mode
`0750`. A bind mount hides ownership prepared in the image, so host preparation
is mandatory.

Runtime validation rejects overlapping media and package-cache roots. Canonical
paths are compared after `realpath`, exact root aliases compare filesystem
device and inode identity, and deployment tests keep bind sources distinct.
Internal path helpers are consumed only through declared package subpaths; no
deep import of `repositorySupport.ts` is allowed.

### Layout

```text
/var/lib/cms/integration-packages/
├── objects/
│   └── sha256/
│       └── <digest>/
│           ├── package.json
│           └── root/
├── .staging/
│   └── <operation-id>/
└── .corrupt/
    └── <operation-id>/
```

Staging and final objects are on the same filesystem so directory rename is
atomic and never crosses devices.

### Materialization

For one digest the materializer:

1. fetches and bounds the package response;
2. validates identity, version, envelope, and digest;
3. creates a unique sibling staging directory;
4. writes the canonical package document and materialized files;
5. verifies the completed staging object;
6. sets staged files to mode `0440` and staged directories to `0550`;
7. attempts the final rename without a check-before-rename.

The `objects/sha256` parent remains mode `0750` and writable by the cache
manager. Normal cache operations never edit a committed object in place. The
read-only object modes reduce accidental mutation but are not a security
boundary: quarantine and future garbage collection first atomically rename the
digest directory through its writable parent, then an owner-only cleanup path
may restore directory write bits before recursively deleting the detached
object.

If rename reports `EEXIST` or `ENOTEMPTY`, another writer may have won. The
existing object is a candidate success, not an unconditional success:

- verify the existing object against the expected digest and files;
- if valid, reuse it and delete only the losing staging directory;
- if invalid, atomically quarantine it under a per-digest repair lock and retry
  publication.

This handles concurrent materializations without a TOCTOU failure while still
covering host tampering or cache corruption.

Abandoned staging entries are cleaned on startup after a short safety age.
Objects are verified before use; a corrupt object is refetched when the
repository is available and fails closed otherwise.

### Future Garbage Collection Rule

Automatic object collection is not implemented in Lot 0, but its rule is fixed:

- live digests are installation `packageDigest` values plus active operation
  leases;
- unreferenced objects are eligible only after a configurable grace period,
  initially 30 days;
- staging cleanup and object collection are separate operations;
- collection supports dry-run, size metrics, bounded deletions, and structured
  logs before automatic scheduling is enabled.

## Connector Deployment Inversion

`ConfiguredSupabaseConnectorDeployer` must no longer construct an
`IntegrationPackageLocator` from `OFFICIAL_INTEGRATIONS_ROOT`.

Connector deployment receives an injected package-root resolver. SQL manifest
loading and Edge Function body construction operate only inside the resolved,
verified, materialized version root.

The production CMS composes:

- an HTTP exact-package source;
- the durable content-addressed cache;
- the embedded exact-version fallback for legacy installations;
- the package-root resolver passed to connector deployers.

This makes `P9R_INTEGRATION_REPOSITORY_URL` functional for definitions, SQL,
functions, assets, installation, restart, and rerun.

## Lot 0: Complete Remote Consumption

Lot 0 is delivered in this order.

### 0.1 Correct Rerun Semantics

- Resolve the installed snapshot and exact version by default.
- Prevent channel resolution during rerun.
- Prevent the remote definition from overriding the stored snapshot.
- Stop rerun from rewriting the version pin.
- Introduce the explicit upgrade boundary.
- Cover stable-channel movement with regression tests.

### 0.2 Enforce Version Semantics

- Validate repository exact versions with SemVer.
- Require package, index, and definition identity agreement.
- Add optional dependency `versionRange`.
- Validate and enforce the supported range subset.

### 0.3 Introduce The Package Contract

- Create `@bernouy/cms-integration-packages`.
- Implement the envelope parser, canonical serializer, and digest.
- Add the immutable, digest-covered `releaseNotes` file reference.
- Implement the hardened generic filesystem package reader.
- Add malicious path, symlink, limit, binary, and determinism tests.

### 0.4 Serve Public Packages From The Current Repository

- Move the embedded repository group from the Control runner to the Delivery
  runner and update the loopback client to use `DELIVERY_PORT`.
- Apply that topology change in both composition roots:
  `cms-server/src/runtime/mountSurfaces.ts` and
  `cms-cli/src/commands/dev/servers.ts`; update both production and dev
  loopback URLs, including `cms-cli/src/commands/dev/services.ts`.
- Add exact `GET /api/integrations/package?kind=...&version=...`.
- Add the matching public `HEAD` contract.
- Add exact `GET` and `HEAD`
  `/api/integrations/release-notes?kind=...&version=...`; a bootstrapped legacy
  package without notes returns `404`.
- Require an explicit version.
- Return digest metadata, immutable public caching, and public CORS headers.
- Add the generic direct/trusted-proxy/disabled client-address resolver to
  `@bernouy/http-runner`, independently of analytics IP handling.
- Apply the public package-download rate limit before package traversal.
- Configure standard Compose for one trusted proxy hop and local CLI development
  for direct-peer mode.
- Document and test `CMS_HTTP_CLIENT_ADDRESS_MODE` and
  `CMS_HTTP_TRUSTED_PROXY_HOPS` in runtime environment parsing, Compose,
  `.env.example`, and deployment documentation.
- Keep loopback traffic on its dedicated direct key, reject other invalid
  forwarding chains with `400 invalid_forwarded_chain`, and document that each
  CDN adds one configured trusted hop.
- Serve the current embedded official catalog through the same package
  contract.
- Add typed upstream errors and request timeouts without introducing read
  credentials.

### 0.5 Provision Durable Cache Storage

- Add `CMS_INTEGRATION_PACKAGE_CACHE_DIR`.
- Extend the CMS Dockerfile mount-point preparation.
- Add the dedicated Compose bind mount.
- Document host ownership, permissions, backup, and capacity.
- Validate non-overlapping roots.
- Preserve existing unrelated image-optimization changes in the touched infra
  files.

### 0.6 Materialize And Pin Packages

- Implement HTTP retrieval, digest verification, durable staging, atomic
  publication, collision handling, and corruption quarantine.
- Add optional `packageDigest` persistence.
- Add the exact-version embedded fallback for legacy installations.
- Ensure cache construction performs no network request at CMS startup.

### 0.7 Inject Package Roots Into Deployers

- Replace `integrationsRoot` construction with an injected resolver.
- Make SQL schemas and Edge Functions consume the pinned package root.
- Verify every connector file remains inside that root.

### 0.8 Prove The Degraded Path

Run the full Lot 0 acceptance scenario described below.

## Lot 0 Acceptance Scenario

1. A public read-only repository serves an integration absent from the CMS
   image without requiring credentials.
2. The CMS browses and installs its exact remote version.
3. SQL and Edge Functions are deployed from the remote package.
4. The installation stores version, snapshot, and digest.
5. The CMS is stopped.
6. The repository becomes unreachable.
7. The CMS restarts successfully without eager repository access.
8. Delivery remains operational.
9. CMS integration pages render a structured repository-unavailable state.
10. Connector rerun succeeds from the durable pinned cache.
11. A cache miss while the repository is down fails explicitly without
    changing the installation pin.
12. A corrupt object is rejected; it is repaired when the repository returns
    and fails closed while the repository remains unavailable.
13. Two concurrent materializations of the same digest converge on one valid
    object without surfacing `EEXIST` or `ENOTEMPTY`.

Lot 0 is not complete until this scenario passes across an actual CMS process
restart and persistent bind mount.

## Lot 1: Mutable Filesystem Registry

### Publication API

Create `@bernouy/cms-integration-registry` and
`@bernouy/cms-repository-management`.

The management candidate API:

- requires a management-scoped service token;
- applies the existing `@bernouy/rate-limiter` contract after authentication and
  before reading the package body, keyed by the authenticated service principal;
- returns `429 Too Many Requests` with retry metadata when the publication
  policy is exceeded;
- accepts a canonical validated candidate envelope and returns `202 Accepted`
  with its immutable candidate identity and lifecycle status;
- applies request and decoded-content limits before candidate planning;
- validates definition identity, SemVer, dependencies, package structure, and
  digest;
- requires and validates the UTF-8 release-notes reference outside legacy
  bootstrap;
- requires a validated declarative schema compatibility manifest for every new
  SQL-owning connector;
- plans a canonical compatibility V2 root and digest-binds the exact evaluator
  inputs before verification;
- persists compatibility, verification, migration, and composite release
  admission evidence only during validated finalization;
- refuses activation when the composite decision is inadmissible; a
  `422 admission_rejected` belongs to candidate finalization, not to the retired
  synchronous package-publisher response;
- publishes and activates a new kind or immutable version only from that exact
  current admissible composite decision;
- exposes candidate status and report reads throughout the asynchronous
  lifecycle;
- returns `409 Conflict` for every existing `(kind, version)`;
- never exposes force or overwrite.

The single-process MVP injects `InMemoryRateLimiter`. A horizontally scaled
runtime injects the already available `MongoRateLimiter` from
`@bernouy/rate-limiter/mongo` when MongoDB is part of its composition, or
another shared implementation. The shared Mongo adapter is existing foundation
code, not work deferred by this plan; per-process counters must never be
presented as a global publication limit.

The Lot 1 database-compatibility implementation is deliberately bounded to:

1. parsing and normalizing the declarative schema contract;
2. structurally comparing two normalized declarations;
3. persisting the comparison evidence and report.

It does not include a PostgreSQL parser or migration executor. Trusted
PostgreSQL introspection is an optional CI evidence producer outside the
registry request path, not a prerequisite hidden inside publication.
Bootstrap additionally supports the one-time digest-bound baseline contracts
needed by legacy official SQL packages; normal publication cannot mutate them.

For a new integration, the first admissible version initializes `stable` and
`latest`. For a subsequent version, activation advances `latest` and leaves
`stable` unchanged. Explicit stable promotion confirms the current composite
decision revision ID; the registry resolves and digest-validates that decision,
then stores its ID and digest in the promotion record. Yank and arbitrary
channels remain deferred.

### Atomic Publication

Publication occurs under a per-kind lock:

1. parse and validate outside the live catalog;
2. materialize a staged version directory;
3. validate the candidate catalog index;
4. acquire the kind lock and recheck version absence;
5. rename the version directory into the live package;
6. atomically replace `integration.json` last;
7. construct and validate a new immutable catalog snapshot;
8. atomically swap the in-memory snapshot.

Readers keep using the previous snapshot throughout publication. A visible
version directory that is not yet referenced by `integration.json` is harmless;
the inverse order is forbidden because indexes may not reference missing
versions.

### Index Snapshot, Quarantine, And Recovery

The repository runtime scans at startup, not on every request. It builds an
immutable in-memory snapshot containing summaries, indexes, exact-version
locations, package metadata, and release-notes locations.

Startup validates integrations independently. One corrupt integration:

- does not fail all valid catalog entries;
- is excluded or quarantined;
- produces structured diagnostics;
- marks repository health degraded.

Publication invalidates by building a complete candidate snapshot and swapping
one reference. Package reads resolve locations through that snapshot instead of
rescanning the catalog.

Recovery handles:

- abandoned publication staging;
- orphan version directories not referenced by an index;
- an index replacement interrupted before snapshot swap;
- corrupt live packages;
- duplicate kinds or version identities.

Recovery must be deterministic and never make partially validated content
visible.

## Lot 2: Repository Runtime And Image

Create `@bernouy/cms-repository-server` and
`infra/images/cms-repository`.

The runtime:

- mounts an anonymous read surface and a separately routable management
  surface;
- authenticates only the management surface with a management-scoped service
  token;
- serves an in-memory snapshot backed by a persistent filesystem registry;
- reports ready, healthy, and degraded states;
- does not depend on MongoDB or S3 for the MVP;
- does not require a direct public host because the management CMS provides the
  canonical public read origin.

The deployment:

- places the service on a dedicated internal Docker network shared with the
  management CMS;
- exposes public repository `GET` and `HEAD` routes only through the CMS
  Delivery gateway;
- applies package-download limiting at that gateway even when no CDN is
  deployed;
- never forwards the management listener or routes through public ingress;
- gives it a dedicated persistent registry volume;
- keeps the image root filesystem read-only;
- grants write access only to its registry volume and bounded temporary
  locations;
- keeps the management credential out of Compose source and images.

### Seed Policy

The image initializes only an empty registry volume. Bootstrap imports the
official catalog through the same validation and index-building rules used by
normal publication.

Once the registry volume is initialized:

- image upgrades never reconcile or mutate registry data;
- a `docker compose pull` cannot implicitly publish integrations;
- new official versions are published through the management API;
- CI may automate that publication, but it remains visible, validated, locked,
  and auditable.

## Lot 3: Public CMS Catalog And Administration Console

The dedicated management CMS proves that CmsCore can power its own internal and
public tooling. CMS Delivery serves a public integration catalog, while CMS
Control adds the authenticated repository administration area.

The public catalog supports:

- search, categories, providers, and compatibility filters;
- integration detail pages and complete version histories;
- `stable` and `latest` status;
- dependencies and supported version ranges;
- public compatibility reports and release notes;
- immutable compatibility V2 roots, append-only reassessment history, and the
  current composite admission summary;
- blocs, connectors, and other artifact summaries;
- documentation and exact package downloads.

The public UI reads the anonymous same-origin repository API. It contains no
special repository credential and remains usable by search engines, CLI tools,
and external consumers. Release notes come from the digest-covered Markdown
file referenced by the package envelope and are rendered with raw HTML disabled
and sanitized output.

The initial authorization policy permits one CMS administrator account to:

- inspect stable/latest status and package digests;
- inspect detailed validation, compatibility, and repository health errors;
- publish a new integration;
- publish a new immutable version;
- promote an eligible version to `stable`;
- trigger an explicit upgrade for a CMS installation.

The CMS server:

- translates human authorization into internal service calls;
- stores only the repository management credential in server-side secret
  storage;
- validates upload size before proxying;
- returns structured conflicts and validation results;
- never exposes the management credential, internal management URL, or raw
  upstream bodies.

The first console may upload a prepared package JSON document. The shared
package library can later support a CLI pack command or browser directory
selection without changing the repository protocol.

Granular permissions, audit exploration, yanking, and multi-account repository
management are follow-up work.

## API Summary

Read surface, relative to the public `/.cms/repository` mount:

- `GET /api/integrations`
- `GET /api/integrations/index?kind=...`
- `GET /api/integrations/versions?kind=...`
- `GET /api/integrations/definition?kind=...&version=...`
- `GET /api/integrations/asset?kind=...&version=...&path=...`
- `GET /api/integrations/package?kind=...&version=...`
- `GET /api/integrations/release-notes?kind=...&version=...`
- `GET /api/integrations/compatibility?kind=...&version=...`

These routes are anonymous. Exact immutable resources also expose `HEAD`, digest
ETags, long-lived public caching, and public CORS.
The compatibility response returns an allowlisted projection of the V2
compatibility `root`, `current`, and paginated `revisions`, plus bounded count
and cursor metadata. It omits actors, finding paths and finding
baseline/candidate digests, filesystem or source locations, and unknown upstream
fields. Its collection ETag changes when a revision is appended; it does not use
the immutable package cache policy.

Management surface:

- publish a package for a new kind or version;
- inspect candidate validation and the compatibility, verification, migration,
  and composite-decision evidence;
- request an append-only compatibility reevaluation that also reconciles the
  composite decision;
- inspect degraded and quarantined entries;
- promote stable through an explicit operation that confirms the current
  composite decision revision ID and records its resolved ID and digest.

Exact management paths are finalized with the surface implementation, but read
and management surfaces must remain independently mountable. Only management is
authenticated and reachable exclusively from the CMS Control gateway.

## Test Strategy

### Unit And Contract Tests

- canonical JSON produces a stable digest regardless of input key order;
- RFC 8785 fixtures cover slash escaping, non-ASCII characters, control
  characters, UTF-16 property ordering, and rejection of lone surrogates;
- UTF-8 and base64 round-trip;
- malformed encodings and invalid UTF-8 declarations fail;
- path traversal, absolute paths, backslashes, duplicate normalized paths,
  symlinks, and special files fail;
- depth, file-count, body, and decoded-byte limits fail closed;
- exact versions and supported ranges follow SemVer behavior, including
  prerelease boundaries;
- patch and minor compatibility checks accept additive compatible changes and
  produce `contractAdmissible: false` for breaking or public-contract-unknown
  changes; candidate finalization refuses an inadmissible composite decision;
- implementation-only SQL and Edge Function changes remain eligible for patch
  releases when their extracted or declared contracts are unchanged;
- SQL schema and HTTP function contract fixtures cover additive, breaking, and
  genuinely indeterminate changes;
- declarative schema parsing and comparison require no PostgreSQL parser or
  migration execution;
- a detected SQL/declaration contradiction rejects the package at every release
  level;
- legacy SQL baselines accept only bootstrap-time, digest-bound reviewed
  contracts and remain `unknown` when that evidence is absent;
- first-kind and new-major V2 roots persist explicit no-baseline reasons;
- compatibility V2 roots are immutable and reevaluation appends
  provenance-bearing revisions without deleting history;
- composite admission decisions bind the exact current compatibility,
  verification, migration, stateful-change, and policy evidence;
- compatibility-history ETags change on append while immutable package ETags do
  not;
- stable promotion resolves the confirmed current composite decision ID and
  records its digest, while a later inadmissible decision performs a journaled
  eligibility and channel repair;
- major compatibility reports permit breaking changes without silently
  promoting them to stable;
- repository client errors map to stable `502` and `503` contracts;
- public reads require no credentials and return the specified ETag, cache, and
  CORS headers;
- release notes round-trip as digest-covered UTF-8 Markdown and unsafe rendered
  markup is sanitized;
- package download rate limiting runs before filesystem walking or upstream
  fetching and returns retry metadata;
- client-address tests cover direct peers, trusted hop selection, spoofed and
  malformed forwarding chains, disabled mode, and the absence of a shared
  proxy-IP quota;
- invalid forwarded chains return `400 invalid_forwarded_chain` before limiter,
  upstream, or filesystem work, while loopback uses its separate direct key;
- production and CLI dev composition tests mount repository reads only on
  Delivery and point their loopback clients at the Delivery port;
- rerun always selects the installation pin;
- upgrade changes the pin only after success.

### Cache Tests

- staging and objects share one filesystem;
- restart preserves a valid object;
- concurrent writers converge;
- an existing valid target wins safely;
- an existing corrupt target is quarantined and repaired;
- registry outage uses the cache;
- registry outage plus cache miss fails explicitly;
- startup staging cleanup respects its safety age;
- media reconciliation never observes the dedicated cache.

### Registry Tests

- new kind and new version publication succeed;
- duplicate version returns `409`;
- failed validation never changes the live catalog;
- index is replaced after the version directory;
- readers retain the old snapshot during publication;
- one invalid package does not poison valid packages;
- recovery handles each crash boundary;
- bootstrap only mutates an empty volume;
- compatibility V2 roots and composite release decisions persist with published
  versions, while the public compatibility-history route exposes only the
  redacted V2 projection;
- compatibility reevaluation is append-only, cannot mutate the V2 root or older
  revisions, and appends a reconciled composite decision when its inputs change;
- initial `latest` activation requires the exact current admissible composite
  decision, and `stable` promotion confirms that decision's revision ID;
- management rate limiting runs before package-body parsing and returns retry
  metadata.

### Deployment Tests

- CMS and repository root filesystems remain read-only;
- the package cache and registry have dedicated writable mounts;
- media and package-cache roots do not overlap;
- staging paths reside under their final mounts;
- embedded and remote read modes start without a repository read token;
- embedded repository routes are public on Delivery and absent from Control;
- the standard proxy topology configures one trusted hop independently of
  analytics, while a missing trust policy cannot create a shared proxy bucket;
- a CDN deployment fixture configures two trusted ingress hops, and loopback
  package consumption still succeeds in trusted-proxy mode;
- disabled client-address mode emits the documented residual-risk warning
  without failing readiness;
- the CMS Delivery origin exposes anonymous repository reads and the public
  catalog;
- deployments without a CDN retain the configured package-download limit;
- public ingress never exposes repository management routes;
- only the management token is present in server-side secret configuration;
- bind-mount directories and image mount points are writable by the runtime
  user.

## Operational Requirements

- Structured logs include operation ID, kind, version, digest, compatibility
  report and revision IDs, evaluator version, outcome, and duration without
  credentials or package contents.
- Metrics cover repository latency, cache hit/miss/corruption, materialization
  bytes, public package bytes and rate-limit rejections, registry snapshot size,
  quarantined entries, compatibility reevaluations and warnings, publication
  outcomes, and filesystem capacity.
- Readiness means the last valid snapshot can serve requests.
- Degraded health means valid entries remain available while corrupt entries or
  upstream dependencies require attention.
- Repository unavailability does not stop CMS Delivery.
- Disk-full errors fail before the installation pin is changed and retain
  enough staging provenance for safe cleanup.
- Registry and cache backup policies are documented separately because their
  recovery requirements differ.

## Implementation And Review Boundaries

- Run workspace validation before and after every implementation slice.
- Keep the existing `cms-integrations` immediate directory fanout from
  increasing beyond eight.
- Use only declared package names and subpaths across package boundaries.
- Keep filesystem and HTTP adapters out of browser bundles and adapter-light
  root exports.
- Add focused tests with each behavior change.
- Preserve unrelated dirty-worktree changes, especially the current CMS image
  optimization edits in Compose, environment examples, deployment
  documentation, and deployment tests.
- Review any new file above the workspace size guidance for cohesion rather
  than splitting mechanically.

## Recommended First Implementation Slice

The first change set contains no package format or registry implementation:

1. make rerun use the installed snapshot and exact version;
2. reject implicit version changes and establish the explicit upgrade boundary;
3. introduce typed repository availability and contract errors with timeouts;
4. move the embedded read surface from Control to Delivery and point loopback
   consumption at `DELIVERY_PORT` in both `cms-server` and `cms-cli` dev;
5. preserve anonymous read behavior with explicit public-cache and CORS tests;
6. add unavailable-repository and stable-channel-movement regression tests.

This slice closes the silent rerun upgrade and fixes degraded error behavior
without inventing read credentials or depending on the package format.

## Definition Of Done

The global repository initiative is complete when:

- the Lot 0 remote-only and degraded acceptance scenario passes;
- catalog metadata, definitions, assets, and exact packages are publicly
  readable and downloadable without credentials;
- repository management is reachable only through authenticated CMS Control
  and its internal management token;
- installations and reruns are pinned to immutable version content;
- remote connector SQL and functions no longer depend on image-bundled paths;
- minor and patch publication fails when backwards compatibility is broken or
  a changed public contract cannot be proven compatible;
- publication is immutable, atomic, snapshot-based, and recoverable;
- one invalid integration cannot fail the full catalog;
- a dedicated repository image runs only on an internal network with persistent
  storage;
- official updates use the publication API after bootstrap;
- CMS Delivery provides the public browsing catalog and CMS Control lets
  administrators publish and manage stable versions without exposing the
  management credential;
- workspace architecture, style, typecheck, tests, and deployment checks pass
  without new task-introduced findings.
