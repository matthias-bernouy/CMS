# Source and provider transition

CmsCore is the Bun and TypeScript monorepo behind the Ulvia CMS platform.

This branch, `codex/refonte-sources`, is the working branch for a deliberate
redesign of sources and integrations. The repository is not expected to keep
the current integration model backward compatible while this work is in
progress: no production site depends on it yet, and a temporarily unstable
implementation is preferable to preserving concepts that are about to be
removed.

## Source and provider redesign

The design reference currently lives outside this repository at:

```text
/home/matthias/Documents/Test/UlviaInterfaces
```

`UlviaInterfaces` is a design sandbox, not code to copy blindly. It contains
the beginning of the new model: published contracts, capabilities, HTTP
bindings, provider implementations, a CMS gateway, executable conformance
scenarios, mocks, health reports, collections, text variables, blocs, views,
and dashboards.

At the time of this review, the sandbox contains 12 domain contracts and 282
capabilities, with roughly 460 mocks and 82 conformance scenarios. Its 217
tests pass, and every generated contract passes its local verifier. This gives
us a substantial behavioral reference, but it does not yet make the protocol
production-ready.

### Why this redesign exists

The current CmsCore integration system combines too many concerns: integration
packages, sources, functions, triggers, roles, permissions, connector
deployment, and provider-specific infrastructure. The resulting model is
powerful but difficult to understand, author, replace, and operate.

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

### Scope of the current work

The first milestone covers only:

- contracts and capabilities;
- provider manifests and installations;
- capability bindings and the CMS gateway;
- provider-to-provider dependencies through the gateway;
- conformance, health, errors, identity, and operational behavior;
- the official Ulvia provider boundary.

The following subjects are deliberately deferred until that foundation is
stable:

- collection replacement;
- the new bloc format and editors;
- views and dashboards;
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

Before the sandbox model is integrated into CmsCore, six areas must be made
explicit and testable.

### 1. Provider manifests and approved installations

The runtime provider report must not be the authority for permissions. In the
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
- pairwise user IDs are scoped by installation, not hostname;
- a custom provider uses a locally approved manifest;
- the official provider uses a registry-published manifest;
- disconnecting or revoking an installation immediately invalidates its
  provider-to-gateway credential.

The registry may later sign manifests cryptographically. The first invariant
is that a provider cannot grant permissions to itself.

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
- `GET` and `HEAD` do not carry a body;
- the success status is a 2xx status;
- declared errors have one valid 4xx or 5xx mapping;
- binary schemas and content types agree with the binding;
- no two bindings collide on method and path;
- security headers such as `Authorization`, `x-ulvia-*`, `traceparent`, and
  `Content-Length` cannot be mapped from contract input.

Scenario inputs, assertions, capture paths, pagination walks, duplicate IDs,
and idempotency replays must also be validated statically. Runtime routing
must consume only compiled bindings.

### 3. Versioning and compatibility

The sandbox currently versions both a contract and every capability. That
creates two compatibility boundaries and allows older capability versions to
disappear without being detected when only the latest version is compared.

The preferred Protocol v1 design is one SemVer per contract release:

- capabilities have stable IDs but no independent version;
- requirements reference a contract version range and a capability ID;
- providers implement an exact contract release and digest;
- breaking any capability requires a new contract major;
- compatible additions require a minor;
- descriptions and mocks may change in a patch;
- installed releases and dashboard plans pin the contract digest.

Capabilities also need lifecycle metadata such as `deprecated`, `replacedBy`,
and `sunsetAt`. Registry releases remain immutable but may be marked deprecated
or yanked. If independent capability versions are retained instead, the
compatibility engine must compare every `(capability ID, major)` pair and keep
all previously supported versions visible. This decision must be settled
before porting contracts.

### 4. Idempotency, retries, rate limits, and errors

Every capability must declare protocol behavior in addition to its data
schema:

```ts
type CapabilityBehavior = {
    effect: "query" | "command";
    idempotency: "natural" | "keyed" | "unsafe";
    execution: "sync" | "operation";
};
```

An idempotency key belongs to the invocation envelope and transport, not to
each business input schema. For a keyed command, the provider guarantees:

- the scope is installation, capability, caller, and key;
- the same key and payload produce the same result exactly once;
- the same key with another payload returns `IDEMPOTENCY_CONFLICT`;
- results and operation IDs survive retries for a documented retention time;
- conformance includes a replay test.

The gateway may retry queries, naturally idempotent commands, and keyed
commands carrying a key. It must never retry an unsafe command automatically.

Every error response carries a stable code and request ID, plus retry
information when relevant. Protocol-level errors include at least
`RATE_LIMITED`, `TEMPORARILY_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT`,
`CURSOR_EXPIRED`, `OPERATION_EXPIRED`, `CANCELED`, and `PROTOCOL_MISMATCH`.
The gateway preserves a narrow response-header allowlist including
`Retry-After`, `ETag`, `Cache-Control`, `Content-Disposition`, and range
headers.

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
actor type: anonymous, user, admin, provider, or system.

Important rules:

- provider-to-gateway calls act as the provider installation;
- they never inherit an end user implicitly;
- future user delegation requires a separate short-lived scoped token;
- pairwise user aliases are stored when reverse translation is required;
- admin remains a CMS boundary, not a provider-defined role;
- later dashboard grants narrow capability inputs and outputs without
  recreating the old role/permission system.

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

Provider switching is another separate requirement. Before production data
exists, the design needs snapshot export/import, checksums, dry runs,
incremental catch-up, cutover, reconciliation, and rollback. GDPR exports are
not provider migration formats.

Files also need explicit lifecycle rules. Immutable IDs are useful for
caching, but personal files and deleted resources cannot be cached forever.
Common file metadata should include a digest and a cache/revocation policy;
large files eventually need streaming or range support.

## Delivery plan

The migration is intentionally ordered so that authority and compatibility
are settled before hundreds of capabilities are ported.

### Phase 0 — Freeze the protocol decisions

- record the selected versioning model;
- define the contract release, provider manifest, installation, invocation,
  error, operation, and change-feed types;
- decide what is protocol-level and what remains domain-level;
- turn the decisions into focused contract tests.

Exit condition: the interfaces can describe the UlviaInterfaces examples
without relying on the old integration model.

### Phase 1 — Registry and binding safety

- implement immutable contract and provider-manifest releases;
- pin digests;
- implement binding compilation;
- implement compatibility reports and lifecycle metadata;
- add negative tests for every malformed binding and incompatible release.

Exit condition: a malformed or permission-expanding release cannot become
installable.

### Phase 2 — Installation and gateway runtime

- implement provider installation persistence and credential rotation;
- approve and resolve `requires` from manifests;
- add invocation context and installation-scoped identity;
- implement the error envelope, retry policy, rate limiting, audit, and
  observability;
- add SSRF, redirect, DNS-rebinding, HTTPS, timeout, and response-size guards.

Exit condition: a custom provider cannot escape its approved capabilities or
override gateway identity.

### Phase 3 — Operations and synchronization

- implement operation polling and cancellation;
- implement snapshots, watermarks, and change feeds;
- convert payment, forms, and newsletter first because they exercise money,
  files, imports, exports, and external state;
- test retries after ambiguous timeouts, duplicate events, tombstones,
  expired cursors, and operation expiry.

Exit condition: the CMS can recover after a restart or network failure without
duplicating effects or silently losing changes.

### Phase 4 — Official provider and contract migration

- implement the official provider without Supabase;
- port the remaining official contracts;
- run conformance in isolated disposable tenants;
- make conformance coverage warnings blocking for official releases;
- exercise end-to-end flows across several provider installations;
- remove superseded source, integration, function, trigger, role, and
  permission paths only after their replacement behavior is covered.

Exit condition: official contracts work exclusively through the new gateway,
and the old runtime is no longer part of the composition root.

### Phase 5 — Collections, views, and text variables

Only after the provider protocol is stable:

- port the new collection and bloc model;
- integrate site and admin text variables;
- compile views and dashboard grants against contract releases;
- add JSON-LD projections;
- add push event delivery if polling change feeds is insufficient.

## Definition of done for Protocol v1

Protocol v1 is ready to become CmsCore's integration foundation when:

- permissions come only from an approved manifest;
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
  Supabase.

## Workspace architecture

Packages remain organized in five layers with one-way dependencies:

```text
runtimes -> surfaces -> resources -> features -> foundation
```

- `foundation/` contains generic utilities with no CMS-domain knowledge.
- `features/` contains CMS contracts, validation, and adapter-light behavior.
- `resources/` contains official declarative resources and releases.
- `surfaces/` mounts features into HTTP applications.
- `runtimes/` select adapters, read environment, and start processes.

The new protocol must follow the same direction. Contracts and validation
belong in features; official contract and provider manifests belong in
resources; gateway routes belong in surfaces; provider and CMS composition
belongs in runtimes. Persistence and network adapters remain explicit
composition-root choices.

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

`bun run build` builds `@bernouy/components`, then TypeScript project
references, then `@bernouy/cms-control`.

Repository documentation starts at [`docs/README.md`](./docs/README.md).
Deployment documentation lives at
[`infra/images/cms/README.md`](./infra/images/cms/README.md).

## License

MIT — see [`LICENSE`](./LICENSE).
