# Source and provider transition

CmsCore is the Bun and TypeScript monorepo behind the Ulvia CMS platform.

This branch, `codex/refonte-sources`, is the working branch for the source and
provider redesign. The legacy Source packages have been removed; Protocol v1
and the replacement product flows are still in progress. There is no
production compatibility requirement for the former integration model.

This document records the protocol direction and its high-level phases. The
[execution plan](./PLAN_ACTION.md) tracks the 2026-09-29 implementation state
wave by wave.

## Source and provider redesign

The design reference currently lives outside this repository at:

```text
/home/matthias/Documents/Test/UlviaInterfaces
```

`UlviaInterfaces` is a design sandbox, not code to copy blindly. It contains
the beginning of the new model: published contracts, capabilities, HTTP
bindings, provider implementations, a CMS gateway, executable conformance
scenarios, mocks, health reports, collections, text variables, blocs and views.

At the original investigation, the sandbox contained 12 domain contracts and 282
capabilities, with roughly 460 mocks and 82 conformance scenarios. Its 217
tests passed, and every generated contract passed its local verifier. This gives
us a substantial behavioral reference, but it does not yet make the protocol
production-ready.

### Transition status

The legacy function, trigger, notification-dispatch, integration package,
registry, verification, repository, official-integration resource, role,
permission, `cms-sources` and `cms-source-images` stacks have been removed.
Authentication subjects and CMS membership records contain identity only;
view definitions and grants are still planned.
The Ulvia CLI now starts only the local CMS and MongoDB; it no longer owns package
pull, audit, release, publication, repository, or Supabase workflows.

`@bernouy/cms-repository` now owns contract releases, provider manifests,
installation/selection state and initial collection bundle admission.
`@bernouy/cms-gateway` owns selected synchronous invocation, provider-wide
identity aliases and bounded provider media. Its production runtime uses Mongo
catalogues and site state when `CMS_GATEWAY_SITE_ID` is configured. Authorized
provider management, an official provider, durable operations and change feeds,
collection installation/rendering and published views remain open. The current
Collections UI still serves private and code-backed collections.

### Why this redesign exists

The former CmsCore integration system combined integration packages, sources,
functions, triggers, roles, permissions, connector deployment and
provider-specific infrastructure. That complexity motivated the redesign.

The intended direction is simpler:

```text
Contract -> Provider installation -> CMS Gateway -> Consumer
```

- A **Contract** is an official, provider-neutral description of a domain.
- A **Capability** is one typed operation exposed by a contract.
- A **Binding** describes how the gateway invokes that capability.
- A **Provider** implements one or more exact contract releases.
- A **Provider installation** connects one provider account to one CMS.
- The **CMS Gateway** is the only route between consumers and providers.
- A consumer depends on capabilities, never on a specific provider.

The official Ulvia provider is expected to implement all official contracts
with Ulvia-owned persistence and background processing. It must not depend on
Supabase. Third-party or custom providers may implement the same contracts and
remain interchangeable when they meet the same protocol and conformance
requirements.

### Protocol v1 scope

The protocol foundation covers:

- contracts and capabilities;
- provider manifests and installations;
- capability bindings and the CMS gateway;
- provider-to-provider dependencies through the gateway;
- conformance, health, errors, identity, and operational behavior;
- the official Ulvia provider boundary.

The following subjects depend on that foundation. Collection authored-bundle
admission has started, but their full product flows remain open:

- collection replacement;
- the new bloc format and editors;
- transitional views and their future Control Page replacement;
- text variables and their authoring UI;
- JSON-LD and other structured SEO projections;
- push subscriptions that listen to capability calls.

Change feeds are in scope because providers already need a reliable way to
synchronize without push triggers. Collections and views will later consume
the protocol; they must not define it.

## What is already good in UlviaInterfaces

The sandbox should remain the behavioral reference for the following ideas:

- contracts are published independently from provider implementations;
- capability inputs, outputs, errors, mocks, and bindings are colocated;
- the gateway validates both requests and provider responses;
- undeclared provider output is removed before reaching consumers;
- providers declare cross-contract dependencies instead of addressing other
  providers directly;
- optimistic revisions are used for mutable resources;
- important writes already use idempotency keys;
- health is defined per contract rather than only per process;
- conformance scenarios exercise real business behavior;
- pairwise user identifiers prevent providers from sharing the CMS user ID;
- files travel through the gateway instead of exposing private providers.

The domain modeling is generally strong. The redesign is therefore a protocol
hardening and integration effort, not a rewrite of all twelve domains.

## Protocol v1 work

The sandbox model is being integrated into CmsCore. The six areas below are
Protocol v1 targets; some have partial implementations, as tracked in the
[execution plan](./PLAN_ACTION.md#8-execution-plan).

### 1. Provider manifests and approved installations

The runtime provider report must not define the allowed capability set. In the
sandbox, a provider can currently report its own `requires` list, and the
gateway then uses that list as the provider's allowlist. A provider could gain
new access during an ordinary refresh.

Protocol v1 must introduce two separate records:

- an immutable `ProviderManifest`, published or locally approved, containing
  provider identity, protocol version, exact contract releases, digests, and
  required capabilities;
- a CMS-owned `ProviderInstallation`, containing an installation ID, account,
  endpoint, credential reference, approved manifest digest, approved
  requirements, state, and timestamps.

Rules:

- `requires` comes from the approved manifest, never from a runtime report;
- a report may only describe readiness, build information, and what is
  currently available;
- an expanded requirement set requires explicit approval;
- credentials are scoped and rotated per installation;
- the CMS supports several accounts for the same provider;
- pairwise user IDs use one stable alias per provider ID across that
  provider's installations and sites, never the hostname;
- a custom provider uses a locally approved manifest;
- the official provider uses a registry-published manifest;
- disconnecting or revoking an installation immediately invalidates its
  provider-to-gateway credential.

The registry may later sign manifests cryptographically. The current gateway
and manifest model keep provider reports from approving new capability
requirements. Issuance, rotation and revocation of provider credentials still
need authorized host workflows.

### 2. Exhaustive binding compilation

Bindings must be compiled and rejected at publication time rather than loosely
interpreted at runtime.

The compiler must prove that:

- every capability has exactly one binding;
- every binding targets an existing capability;
- every input property is transported exactly once;
- every path placeholder matches a required scalar input;
- no unknown property appears in path, query, headers, or body;
- body, query, path, and header mappings do not overlap;
- `body: true` means all remaining properties after other mappings;
- `GET` and `HEAD` are queries and do not carry a body;
- path, query and application-header scalars use the fixed `json-percent`
  codec, preserving the distinction between omission, null and strings;
- the success status is a 2xx status;
- declared errors have one valid 4xx or 5xx mapping;
- binary schemas and content types agree with the binding;
- no two bindings collide on method and path;
- security headers such as `Authorization`, `x-ulvia-*`, `traceparent`, and
  `Content-Length` cannot be mapped from contract input.

Scenario inputs, assertions, capture paths, pagination walks, duplicate IDs,
and idempotency replays must also be validated statically. Runtime routing
must consume only compiled bindings.

The pure parameter codec and bodyless HEAD error headers are specified in
[the HTTP parameter profile](packages/features/cms-repository/fixtures/contracts/protocol-v1/http-parameters.md).
The decoder consumes a raw wire value and percent-decodes exactly once; HTTP
adapters must not add a second URL/form decoding pass.

### 3. Versioning and compatibility

The sandbox currently versions both a contract and every capability. That
creates two compatibility boundaries and allows older capability versions to
disappear without being detected when only the latest version is compared.

The preferred Protocol v1 design is one SemVer per contract release:

- capabilities have stable IDs but no independent version;
- requirements reference a contract version range and a capability ID;
- providers implement an exact contract release and digest;
- a provider build may serve several exact releases of the same contract so
  sites can upgrade independently; each release claim requires its own
  conformance evidence, and a newer build does not imply old-release support;
- breaking any capability requires a new contract major;
- provably compatible schema changes and new capabilities require a minor;
- descriptions and mocks may change in a patch;
- installed releases and compiled execution plans pin the contract digest.

An installed site's selected release keeps its own gateway validation and
binding plan after a provider deployment. Widening an input limit from 100 to
150 characters in a later compatible release does not widen the older site's
accepted input. Widening a possible output is different: the provider must
still produce output valid for the old selected release or the gateway rejects
it. A provider can share one current codebase across releases, but neither
SemVer nor a shared build proves that all those release contracts are served.

Schema compatibility is directional: every value accepted by the previous
input must remain valid in the next input, and every value the next output may
produce must remain valid after projection through the previous output schema.
Additive object fields can therefore remain minor, including inside arrays and
maps, provided required fields and projected property bounds remain valid.
Projection never truncates strings, arrays, or maps or coerces values. The checker proves this
recursively for supported types, bounds, required fields, enums, and binary
media types. Unproven relationships conservatively require a major release;
documentation-only or semantically equivalent edits may remain patches.
Effective object cardinalities include bounds already implied by required
fields; an equivalent explicit minimum can remain a patch. String and map-key
lengths are UTF-16 code units. Format validators define a restricted dialect
profile, not full email/URI standards compliance. Admission rejects known
impossible format-length and map-key/count combinations, not every uninhabited
schema; see the [contracts domain guide](packages/features/cms-repository/src/contracts/README.md).

Requirements use bounded exact, caret, tilde, comparator, or OR ranges such as
`^1.0.0 || ^2.0.0`. Their compatibility is set-based: equivalent spellings are
patches, expansions are minors, and loss of any accepted version is major.
Optional `supportRanges` separates evidence partitions from range spelling:
one to four nonempty subsets must cover the accepted set, and omission means
`[versionRange]`. Each support range needs a published release witness that
jointly satisfies that capability's requirements to the same contract. A
literal OR does not automatically require separate evidence for both branches.
Yanking a dependency does not erase historical witnesses. Installation selection
checks the whole explicitly proposed graph and excludes yanked pins in every
replacement, while historical stored selections remain readable.

Compatibility reports distinguish `validEvolution` (identity, ownership and
versioning policy) from `consumerCompatible` (old consumers with pinned output
projection). Neither proves that a provider serves an old release. Prerelease
targets may evolve before stabilization; the catalogue still checks them
against the latest stable release in their own major. A future prerelease does
not block a patch to the current stable version.

Conformance suites can declare exact dependency profiles. A scenario's optional
`profiles` selects known profiles; omission applies to all, and every profile
needs an applicable scenario. Validate each applicable scenario and its profile's
transitive requirements, external setup/verification calls and typed captures.
Each exercised root support range needs a matching profile actually calling
that root capability, not merely selecting a release. Coverage is descriptive
both in aggregate and per profile; it does not prove every version/combination.

Calls now declare bounded keyed replay, operation completion, eventual sync
queries and cursor pagination. Literal template escapes and JSON Pointer
captures cover objects, arrays and asserted map entries; overlapping assertion
paths reject in V1. See [conformance controls](packages/features/cms-repository/fixtures/contracts/protocol-v1/conformance-controls.md).
Fresh disposable isolation applies per applicable scenario/profile pair.
Runtime execution and passing-provider attestations remain outside contracts.

Capabilities may carry deprecation metadata: its presence marks them as
deprecated and requires at least one of `reason`, `replacedBy`, or `sunsetAt`.
A replacement currently identifies another capability in the same release.
Contract releases
are immutable and carry their publisher ID; the catalogue records the actual
publication time. It may attach optional deprecation metadata or yank a release
without changing its digest. A newer release does not automatically deprecate an
older one, and `sunsetAt` is informational rather than an automatic cutoff.

For Protocol v1 installation planning, select one release per contract per site
and check the full selected graph before applying an upgrade. Reject conflicts
with a useful dependency path; do not silently upgrade unrelated consumers.
In-flight operations and keyed retries must keep their original release,
dependency selections and provider context. Migration, cutover, and rollback
tests belong to installations and runtime orchestration, not release admission.

### 4. Idempotency, retries, rate limits, and errors

Every capability must declare protocol behavior in addition to its data
schema:

```ts
type CapabilityBehavior =
    | { effect: "query"; execution: "sync" | "operation" }
    | {
          effect: "command";
          idempotency: "natural" | "keyed" | "none";
          execution: "sync" | "operation";
      };
```

Queries have no business effect and need no idempotency declaration. Commands
declare whether replay is naturally safe, protected by an invocation key, or
has no idempotency guarantee (`none`).

An idempotency key belongs to the invocation envelope and transport, not to
each business input schema. For a keyed command, the provider guarantees:

- the scope is installation, capability, caller, and key;
- the same key and payload produce the same result exactly once;
- the same key with another payload returns `IDEMPOTENCY_CONFLICT`;
- results and operation IDs survive retries for a documented retention time;
- conformance includes a replay test.

The gateway may retry queries, naturally idempotent commands, and keyed
commands carrying a key. It must never retry a `none` command automatically.

Every error response carries a stable code and request ID, plus retry
information when relevant. Protocol-level errors include at least
`RATE_LIMITED`, `TEMPORARILY_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT`,
`CURSOR_EXPIRED`, `OPERATION_EXPIRED`, `CANCELED`, and `PROTOCOL_MISMATCH`.
The gateway preserves a narrow response-header allowlist including
`Retry-After`, `ETag`, `Cache-Control`, `Content-Disposition`, and range
headers.
HEAD has no response body: its compiled error envelope names the reserved
`x-ulvia-error-code` and `x-ulvia-request-id` headers, containing JSON-percent
encoded strings. This preserves error identity even when codes share a status.

### 5. Operations and change feeds

Long-running work cannot be modeled as a normal request with a global timeout
and an in-memory response limit. Imports, large exports, campaign delivery,
media processing, maintenance, and data migration use an `Operation`.

An asynchronous capability always returns `202` and an operation handle. The
provider exposes standard poll and cancel endpoints. An operation records its
state, progress, result or declared error, timestamps, and expiry. The final
result is validated against the initiating capability's output schema.

Change feeds remain domain capabilities such as `payment.payment.changes`, but
share one envelope. Each event has an event ID, resource ID, timestamp,
revision when relevant, and an `upsert` or `delete` type. Protocol v1 guarantees:

- at-least-once delivery;
- stable order within one feed;
- deduplication through `eventId`;
- explicit deletion tombstones;
- an opaque cursor scoped to installation and feed;
- a cursor on every response, including an empty response;
- documented retention and `CURSOR_EXPIRED` behavior;
- snapshot bootstrap with a watermark before incremental consumption.

Future push triggers must deliver the same change-event format. They should be
a delivery mechanism, not a second event model.

### 6. Identity, audit, and observability

The gateway creates an invocation context that providers cannot override. It
contains a request ID, installation ID, optional trace ID, origin, and one
actor type: anonymous, user, provider, or system.

Important rules:

- provider-to-gateway calls act as the provider installation;
- they never inherit an end user implicitly;
- future user delegation requires a separate short-lived scoped token;
- pairwise user aliases are stored when reverse translation is required;
- back-office access is described by views rather than a global administrator
  role or permission catalogue;
- view access may narrow capability inputs and outputs without recreating a
  generic role/permission system.

Every command produces a CMS audit entry with request, actor, origin,
installation, contract release, capability, outcome, duration, input hash,
and idempotency-key hash. Raw inputs and secrets are not logged by default.

Operational telemetry must expose latency and result counts by installation
and capability, timeouts, rate limits, contract violations, last success,
provider build, protocol version, installed contract digests, and end-to-end
request/trace IDs. Health reports include observation time and freshness.

## Other consequences of removing the current system

Removing functions and triggers also removes behavior beyond listening to
capability calls:

- scheduled and cron execution;
- user-authored workflows;
- branching and fan-out/for-each execution;
- durable retry and workflow recovery;
- compensation across several providers;
- a CMS system actor for background work.

Official domain workflows should live inside the official provider. Generic
automation, if still wanted, should later return as a small, separate
Scheduler and Workflow system built on Protocol v1. It must not leak back into
contract or provider definitions.

Disaster recovery is a requirement before production data exists. Protocol v1
must support backup/restore of one provider instance and offline relocation of
one tenant into a clean instance of the same provider implementation and a
compatible build. The recovery format is provider-owned and versioned; it
includes data, files, references, and the operational state required for a
coherent restore, with checksums, dry runs, reconciliation, audit, and an
explicit secret rebinding or rotation policy. GDPR exports are not recovery
formats.

Cross-provider data migration, live catch-up, provider-independent portable
snapshots, and automatic failover are not Protocol v1 requirements. Contracts,
consumer records, and selections must still avoid embedding provider endpoints
so that migration can be designed later per domain, after at least two real
implementations expose what is genuinely portable.

Files also need explicit lifecycle rules. Immutable IDs are useful for
caching, but personal files and deleted resources cannot be cached forever.
Common file metadata should include a digest and a cache/revocation policy;
large files eventually need streaming or range support.

## Delivery plan

The migration is intentionally ordered so that authority and compatibility
are settled before hundreds of capabilities are ported.

### Phase 0 — Freeze the protocol decisions

Status: partial. Contract/provider protocols and fixtures cover the first
release and binding models; executable operation, change-feed and view cases
remain to be finalized.

- record the selected versioning model;
- define the contract release, provider manifest, installation, invocation,
  error, operation, and change-feed types;
- decide what is protocol-level and what remains domain-level;
- turn the decisions into focused contract tests.

Exit condition: the interfaces can describe the UlviaInterfaces examples
without relying on the old integration model.

### Phase 1 — Registry and binding safety

Status: advanced. `cms-repository` implements immutable contract and manifest
admission, canonical digests, compatibility checks, binding compilation and
memory/Mongo catalogues. Live conformance attestations remain open.

- implement immutable contract and provider-manifest releases;
- pin digests;
- implement binding compilation;
- implement compatibility reports and lifecycle metadata;
- add negative tests for every malformed binding and incompatible release.

Exit condition: a malformed release or one with unapproved capability
requirements cannot become
installable.

### Phase 2 — Installation and gateway runtime

Status: partial. Revisioned installation and selection stores, provider-wide
identity aliases, selected synchronous gateway calls, guarded Node transport,
and Control/Delivery routes exist. Authorized management, credential lifecycle,
rate/retry/audit/telemetry and provider/system invocation are still open.

- implement provider installation persistence and credential rotation;
- approve and resolve `requires` from manifests;
- add invocation context and provider-scoped identity aliases;
- implement the error envelope, retry policy, rate limiting, audit, and
  observability;
- add SSRF, redirect, DNS-rebinding, HTTPS, timeout, and response-size guards.

Exit condition: a custom provider cannot escape its approved capabilities or
override gateway identity.

### Phase 3 — Operations and synchronization

Status: open. The gateway can read bounded provider files and serve on-demand
derivatives, but keyed commands, durable operations, snapshots, change feeds
and outbox recovery are not active.

- implement operation polling and cancellation;
- implement snapshots, watermarks, and change feeds;
- convert payment, forms, and newsletter first because they exercise money,
  files, imports, exports, and external state;
- test retries after ambiguous timeouts, duplicate events, tombstones,
  expired cursors, and operation expiry.

Exit condition: the CMS can recover after a restart or network failure without
duplicating effects or silently losing changes.

### Phase 4 — Official provider and contract migration

Status: open for the official provider. `cms-sources` and
`cms-source-images` were removed earlier than this phase's original sequence.
The gateway replacement still needs durable image generation and recovery
behavior before the media objective is complete.

- implement the official provider without Supabase;
- port the remaining official contracts;
- run conformance in isolated disposable tenants;
- make conformance coverage warnings blocking for official releases;
- exercise end-to-end flows across several provider installations;
- prove backup/restore on the original instance and offline relocation into a
  clean compatible instance of the same provider, including files, secret
  rebinding, reconciliation, cutover failure, and rollback;
- finish the replacement behavior for paths already removed, including media
  durability, cache policy, garbage collection and operational coverage;
- finish remaining authored `cms-source*` vocabulary cleanup once its new
  capability grammar is chosen.

Exit condition: official contracts work exclusively through the new gateway,
and the old runtime is no longer part of the composition root.

### Phase 5 — Collections, views, and text variables

Status: collection publication, installation, rendering, Bloc configuration and
localized texts exist. The former Dashboard runtime, assignments and collection
resource are gone. Collection Views remain transitional while unified Control
Pages are planned.

Complete the following product flows after the provider protocol is stable;
initial bundle admission has already started:

- port the new collection and bloc model;
- integrate site and admin text variables;
- integrate retained execution-plan primitives with future Control Pages;
- add JSON-LD projections;
- add push event delivery if polling change feeds is insufficient.

## Definition of done for Protocol v1

Protocol v1 is ready to become CmsCore's integration foundation when:

- provider requirements come only from an approved manifest;
- every installed contract and provider manifest is digest-pinned;
- malformed bindings are unpublishable;
- compatibility checks detect every removed supported operation;
- every command has an explicit idempotency policy;
- retries cannot duplicate an effect;
- large work uses durable operations;
- synchronization survives duplicates, deletes, cursor expiry, and restarts;
- caller identity cannot be supplied or overwritten by contract input;
- every command is auditable without logging secrets;
- providers expose actionable health and telemetry;
- conformance runs in isolation and covers all official capabilities;
- the official provider passes multi-contract end-to-end tests without
  Supabase;
- official-provider tenants can be restored in place and relocated offline to
  a clean compatible instance with verified data and file reconciliation.

## Workspace architecture

Packages remain organized in five layers with one-way dependencies:

```text
runtimes -> surfaces -> resources -> features -> foundation
```

- `foundation/` contains generic utilities with no CMS-domain knowledge.
- `features/` contains CMS contracts, validation, and adapter-light behavior.
- `resources/` is reserved for official declarative resources and releases;
  none is published there yet.
- `surfaces/` mounts features into HTTP applications.
- `runtimes/` select adapters, read environment, and start processes.

The new protocol must follow the same direction. Contract, provider and future
collection definitions and validation belong to one feature package,
`@bernouy/cms-repository`, with separate domains and explicit public subpaths.
The current `./contracts` and `./providers` entrypoints expose pure logic and
models; the package root exports types only. `./collections` now exposes the
first authored-bundle slice: assets, component shells and Light DOM compositions.
Theme/i18n, imports, views, compilation and installation were planned at this
stage and are now implemented to varying degrees. Immutable releases and manifests remain distinct from
site installation state, and pure installation/report validators do not perform
live connections or gateway execution.

Official contract and provider manifests belong in resources; gateway routes
belong in surfaces; provider and CMS composition belongs in runtimes. Persistence
and network adapters remain explicit composition-root choices.

## Working in the workspace

Use Bun from the repository root:

```bash
bun install
bun run check:all
bun run check:style
bun run format
bun run build
bun run typecheck
bun test
bun run clean
```

`bun run build` emits TypeScript project references, then builds the
`@bernouy/cms-control` host runtime from `@bernouy/cms-content/browser`.

Repository documentation starts at [`docs/README.md`](./docs/README.md).
Deployment documentation lives at
[`infra/images/cms/README.md`](./infra/images/cms/README.md).

## License

MIT — see [`LICENSE`](./LICENSE).
