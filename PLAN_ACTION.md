# Source, provider, and collection redesign plan

Status: investigation and design plan only. No implementation in this file.

This document expands the protocol direction recorded in
[`TRANSITION_SOURCES.md`](./TRANSITION_SOURCES.md) into an end-to-end execution
plan. It covers contracts, providers, the gateway, the official Ulvia provider,
collections, blocs, text variables, views, dashboards, admin pages, delivery,
SEO, validation, operations, observability, and final deletion of the current
source/dashboard stack.

The reference sandbox is:

```text
/home/matthias/Documents/Test/UlviaInterfaces
```

It is a behavioral and product-design reference. It is not a package to copy
into CmsCore.

## 1. Starting point

### CmsCore

The branch is `codex/refonte-sources`. There is no production compatibility
constraint. We may change persisted formats, routes, authored markup, package
names, and APIs rather than carrying adapters for concepts that are being
removed.

The previous cleanup removed the legacy integration, function, trigger,
notification-dispatch, role, and permission systems. The repository still has
three large legacy areas that are active and must eventually be replaced:

| Current area | Approximate size | Current responsibility |
| --- | ---: | --- |
| `@bernouy/cms-sources` | 12,496 lines | Source definitions, proxying, validation, overlays, indexing, projections, and telemetry |
| `@bernouy/cms-dashboards` | 6,370 lines | Widget-based views, dashboards, assignments, and execution plans |
| `@bernouy/cms-source-images` | 8,756 lines | Source response interception, image inventory, transforms, and cache |
| Control dashboard runtime and widgets | 12,219 lines | Business dashboard rendering and interactions |
| Control dashboard browser tests | 9,880 lines | Behavioral coverage of the current widget system |

These numbers explain why the transition must be staged. They do not justify
keeping the old abstractions.

The following foundations should be preserved and adapted:

- localized page paths, redirects, and the current page aggregate;
- authentication subjects and verified administrator identity;
- the existing Collections workspace UI shell;
- the page editor and the generic binding/rendering runtime where its behavior
  remains useful;
- `cms-secrets` and envelope encryption for credential references;
- `cms-identities` for aliases and reverse identity resolution;
- the generic rate limiter;
- the HTTP runner and surface/runtime dependency-injection pattern;
- source proxy protections worth transplanting: forbidden-header policy,
  bounded bodies, timeout handling, target validation, response projection,
  and request telemetry;
- the generic image transformation/cache algorithms, after removing their
  dependency on legacy sources;
- reusable admin layout, table, detail, form, file, and navigation components.

The current baseline passes `bun run check:all`. The existing advisory shape
and browser-network warnings are pre-existing and are not protocol guarantees.

### UlviaInterfaces

The sandbox currently contains:

- 12 contracts;
- 282 capabilities and 282 HTTP bindings;
- 464 mocks;
- 82 conformance scenarios containing 480 calls;
- 8 collection blocs;
- 2 admin views and 1 dashboard;
- 217 passing tests and a passing TypeScript check.

The strongest ideas to retain are:

- contracts are independent from implementations;
- consumers require capabilities, not provider endpoints;
- the gateway checks and projects both input and output;
- provider dependencies go back through the CMS gateway;
- errors, mocks, health, files, conformance, and optimistic revisions are
  contract-visible;
- pairwise identities prevent cross-provider correlation;
- collection blocs, texts, themes, views, and dashboard templates form one
  versioned resource graph;
- a published dashboard compiles a narrow execution plan from its views.

### Existing file, cache, and image behavior to preserve

The removal of the legacy Source model must not accidentally erase the useful
engineering originally implemented by the standalone `cms-files` package and
still present under `cms-content/files`, or the engineering in
`cms-source-images`. The current implementation contains several distinct
mechanisms that must not be collapsed under one vague "cache" abstraction:

1. `http-runner` has an in-process response cache for generated HTML and assets.
   It stores raw, Brotli, and gzip representations plus their content hash. It
   is local to one runtime and is neither a durable job system nor a media
   store.
2. `cms-content/files` owns the CMS-authored file library: its metadata tree,
   original bytes, content hashes, upload/update/delete lifecycle, URLs, and
   HTTP serving. Its current image path discovers missing manifests during page
   rendering, queues bounded in-process work, generates a fixed WebP ladder,
   stores content-addressed variants under `CMS_FILES_DIR/.variants`, and
   invalidates the rendered-page cache when work completes.
3. `cms-source-images` owns a second, Source-specific derivative pipeline. It
   stores derivative objects separately from short-lived request lookups,
   persists derivative bytes under `CMS_FILES_DIR/.source-images`, keeps a
   durable Mongo job queue and media index, and runs prioritized Sharp workers.

The `cms-source-images` package will be deleted because its public model is
coupled to `SourceRepository`, source endpoints, source effects, and legacy
installation identifiers. The following design properties are nevertheless
requirements for the replacement and must be ported deliberately:

- derivative recipes and encoder identities are explicitly versioned;
- derivative keys are deterministic and immutable for one source generation,
  recipe, format, width, and encoder identity;
- allowed variant widths and formats are bounded before work is scheduled, and
  arbitrary request URLs can never trigger unbounded Sharp work;
- generation is asynchronous and never blocks the normal content response;
- enqueue is idempotent and deduplicated;
- production jobs are durable, prioritized, leased, renewable, retryable with
  backoff, and recoverable after worker or runtime restart;
- worker concurrency is bounded independently from HTTP request concurrency;
- the media index records generation, queued/processing/ready/failed state,
  completed variants, timestamps, errors, and obsolete derivative keys;
- a stale worker must verify that its source generation is still current before
  publishing results;
- immutable derivative bytes are separate from mutable and short-lived lookup
  records;
- private or subject-scoped media is authorized before a cached derivative is
  disclosed; a globally reusable byte object must not imply a globally public
  lookup;
- public, private, missing, stale, and fallback responses have explicit cache
  policies rather than inheriting one default;
- ready immutable variants use long-lived browser/CDN caching, while an
  original fallback revalidates so it can later be replaced by a derivative;
- the serving endpoint never generates on demand and safely falls back to the
  original when an approved derivative is not ready;
- no-upscale behavior, intrinsic dimensions, responsive `srcset`, and layout
  stability are preserved;
- derivative writes are atomic, corrupt metadata is handled as a miss, and
  reconstructible data has an explicit garbage-collection policy;
- cache hit/miss/stale outcomes, queue delay, attempts, transform duration,
  bytes, evictions, failures, and fallbacks are observable;
- source/download size, MIME type, redirects, timeouts, and target origins are
  validated before decoding or transforming bytes.

These are behavioral requirements, not a requirement to preserve the current
package, Mongo collection names, filesystem layout, or Source terminology.

## 2. What the sandbox does not solve yet

Passing tests show that the prototype is internally coherent. They do not make
it production-ready. The implementation currently has the following gaps.

### Contract and schema gaps

- A contract and every capability each have a version. This creates two
  compatibility boundaries, while the compatibility checker only follows the
  latest capability with a given ID.
- The schema dialect has no explicit name or version.
- Schema parsing does not exhaustively prove that `required` keys exist, enum
  values match their base type, enum values are unique, arrays have an item
  schema, or object structures are internally coherent.
- Free-form objects are accepted but cannot be projected, documented, or
  compared precisely.
- Typed maps and discriminated unions are not modeled. Adding the full JSON
  Schema language would make deterministic compatibility harder, so this needs
  a deliberate small dialect rather than accidental growth.
- Capability behavior is described in prose and business inputs. None of the
  282 capability files declares effect, idempotency policy, or sync/async
  execution. Fifty-two schemas carry an `idempotencyKey` business field.
- Deprecation, replacement, sunset, yank, publisher identity, and catalogue
  publication timestamps are absent.
- Pagination is conventional rather than contractual: both `cursor` and
  `nextCursor` shapes exist.

### Binding gaps

The current validator does not prove all of the following:

- exactly one binding exists for every capability;
- every input property is transported exactly once;
- path placeholders and declared path inputs are identical;
- path inputs are required scalars;
- path, query, header, and body mappings do not overlap;
- a partial body contains only declared, otherwise-unmapped properties;
- `body: true` has unambiguous remaining-property semantics;
- `GET` and `HEAD` never carry a body;
- success status codes are 2xx;
- security and identity headers cannot be mapped from capability input;
- method/path collisions do not exist across one provider host;
- response content types agree with the output schema;
- all conformance inputs, assertions, captures, walks, and replay directives
  are statically valid.

Runtime execution interprets raw bindings directly. It needs to consume a
compiled, immutable binding plan instead.

### Provider and installation gaps

- There is no real `ProviderManifest`. The registry model is only a domain,
  display name, and list of implementations.
- A provider account is identified by its hostname. This prevents multiple
  accounts or installations of the same provider.
- Provider connection, provider identity, account, installation, runtime
  report, and contract selection are conflated.
- `requires` is self-reported by the provider at connection/refresh time and
  immediately becomes its gateway allowlist.
- Implemented releases are not approved or pinned by digest.
- The runtime report has no protocol version, build identity, freshness,
  configuration status, or attestation.
- Credentials are raw API keys stored on the connection record; there is no
  credential reference, rotation, expiry, or revocation model.
- Installation configuration has no schema or CMS-owned validated value.
- Setup is delegated to an external URL without a first-class setup state.
- A provider can nominate subdomains. The prototype acknowledges but does not
  implement DNS rebinding, redirect, and private-address protection.
- Backup/restore and relocation into a clean instance of the same provider are
  undefined. Cross-provider data migration is not a Protocol v1 requirement;
  no portability level or limitation is declared for future implementations.

### Invocation and operation gaps

- There is no request ID, installation ID, trace context, deadline, attempt
  number, caller origin, or protocol version in the invocation context.
- A global `admin: boolean` remains in the prototype gateway. Dashboard calls
  currently forge it for one invocation; the replacement must distinguish a
  verified administrator from a view-delegated call by an authenticated user.
- There is no retry policy, rate-limit contract, circuit breaker, concurrency
  limit, or overload behavior.
- Error responses lose useful headers such as `Retry-After`, `ETag`, range,
  cache, and content-disposition metadata.
- There is no durable audit store. The dashboard prototype audits only writes
  made through dashboard access.
- The three `202` bindings are ordinary responses. No operation resource,
  polling, cancellation, progress, expiry, or restart recovery exists.
- Files are buffered, not streamed; range requests, revocation, cache policy,
  digest verification, and personal-data deletion are undefined.
- Cookie-authenticated public commands need an explicit CSRF policy.

### Change-feed and workflow gaps

- Nine `.changes` capabilities exist, but their common behavior is only a
  prose convention.
- Events have no common event ID, delete tombstone, feed identity, retention,
  cursor scope, cursor-expired behavior, or snapshot watermark.
- The in-memory reference `ChangeLog` can collapse updates within a page and
  returns only the current resource. It is not a durable event log.
- Provider-to-provider workflows have no durable outbox, retry recovery,
  compensation, or system actor.
- Scheduled work and generic user automation were intentionally removed and
  must not silently reappear inside the provider protocol.

### Collection, bloc, text, and view gaps

- Collection JSON files are mostly cast to TypeScript types. Their complete
  runtime shape is not parsed as strictly as contract files.
- Collection compatibility and immutable release publication are not
  implemented.
- Imports use ranges but are not digest-pinned; transitive resolution, cycles,
  and asset collisions need rules.
- Assets have no inventory, digest, media policy, or path-safety contract.
- Template inspection is regex-based. It cannot be the security boundary for
  HTML, expressions, capability calls, or output-field access.
- `behaviour.ts` is checked with forbidden-word patterns. The source itself
  says this is not a sandbox, but no runtime sandbox exists.
- Bloc configuration, collection installation configuration, provider
  configuration, and page content are not clearly separated.
- Text variables cover a good base—parameters, plural forms, locales, and
  fallback—but not rich text, escaping, typed parameters, override storage,
  cache invalidation, locale deletion, or compatibility.
- The view example proves list rendering, but not command forms, uploads,
  operation progress, validation errors, navigation, confirmations, or
  reload/invalidation behavior.
- The view execution-plan compiler is a useful prototype but relies on the
  regex page analysis. A missed read or input flow can become an authorization
  leak.
- The sandbox still calls the immutable contract a `Source`, while CmsCore
  already uses `Source` for the legacy mutable proxy definition. Keeping that
  name would make the migration harder to reason about.

### Registry and conformance gaps

- Registry publication uses one shared bearer key. There is no publisher
  identity, signature, ownership, review state, or transparency history.
- A digest proves content equality, not who published it.
- Provider and collection manifests are not published by the registry.
- Conformance is not recorded as an attestation for an exact provider build,
  manifest digest, contract digest, and isolated test tenant.
- Missing conformance coverage is a warning. Official releases must eventually
  make it blocking.
- Conformance cleanup, seeded clocks, external-event injection, and parallel
  isolation are not standardized.

## 3. Decisions to freeze before implementation

These are the recommended Protocol v1 decisions. Any rejected decision should
be replaced by a short ADR before code is written.

### Vocabulary and identity

- Use **Contract**, never `Source`, for the immutable provider-neutral API.
- Use **ContractRelease** for one immutable SemVer publication and digest.
- Use **Capability** for one stable operation within a contract.
- Use **ProviderManifest** for an immutable provider claim approved before
  installation.
- Use **ProviderInstallation** for one provider account connected to one CMS.
- Use **ContractSelection** for the installation selected to serve a contract.
- Use **CollectionRelease** for one immutable collection package.
- Use **CollectionInstallation** for a release adopted and configured by a
  site.
- Use **ViewDefinition** for a collection-owned business admin composition.
- Use **DashboardDefinition** only for site-owned navigation and grouping of
  views.

Every record gets a stable opaque ID. Hostnames, display names, contract IDs,
and account labels are never database identities.

### Versioning

- One SemVer belongs to the whole contract release.
- Capability IDs are stable and carry no independent version.
- A requirement is `{ contractId, versionRange, capabilityId, supportRanges? }`.
  `versionRange` is accepted versions; optional support ranges are explicit
  evidence partitions, not inferred from textual OR branches. One to four
  nonempty subsets must cover the accepted set; omission is `[versionRange]`.
- An implementation names an exact contract version and digest.
- A compiled consumer pins the resolved release digest while retaining its
  authored range for future upgrade analysis.
- One provider build must be able to declare and serve several exact releases
  of the same contract, including different majors during a site-by-site
  upgrade. Each `(contractId, version)` claim has its own digest and must pass
  conformance for that release. A newer provider build or compatible SemVer
  range does not automatically establish that it serves an older release.
- A site's selected release/digest determines its gateway input, output, and
  binding rules until that site explicitly upgrades. The provider may use one
  current codebase and storage model behind several releases, but must preserve
  each claimed release's observable behavior or provide an adapter. In
  particular, it cannot return a 150-character value to a site whose selected
  release limits that output to 100 characters.
- Releases are immutable. Lifecycle metadata may deprecate or yank a release
  without mutating its contract body.
- Binding changes require at least a minor release because providers must
  change even when consumers do not.
- Compare requirement ranges by set inclusion: equivalent is patch, expanded
  is minor, any lost version is major. Each support range needs a published
  witness jointly satisfying a capability's requirements to the same contract;
  historical yanked releases remain valid references.
- Additive output fields can be minor when projection to the previous schema
  is proven valid. Scalar bounds are not silently truncated or coerced.
- Separate `validEvolution` from `consumerCompatible` in compatibility reports.
  Neither is a provider conformance attestation.
- Stable compatibility is checked within a major line. Prereleases may evolve
  within their target while preserving the latest stable baseline; future
  previews must not block maintenance of the stable release.
- Protocol v1 installation selection chooses one release per contract per site.
  Resolve all selected consumers and transitive requirements together; reject
  conflicts before applying an upgrade. Operations and keyed retries retain
  their original release, dependency selection and provider context.

### Schema dialect

- Define and version a small `ulvia-schema/v1` dialect.
- Keep deterministic projection and compatibility as primary requirements.
- Support JSON scalars, object, array, binary, typed maps, nullable values,
  bounded inputs, formats, and a narrowly defined discriminated union if an
  official contract proves it is needed.
- Do not accept arbitrary JSON Schema keywords.
- Do not accept regex patterns in provider-facing input validation.
- Give every validator explicit depth, node-count, string, array, object-key,
  body, and binary limits.
- String/map-key lengths use UTF-16 code units. The format profile is the
  concrete `@bernouy/cms-repository/contracts` validator behavior, not implied
  full email/URI standards compliance; see its [domain guide](packages/features/cms-repository/src/contracts/README.md).
- Reject known impossible format-length and map-key/count combinations without
  claiming general schema satisfiability. Effective object minimum counts
  include required fields; equivalent constraints may remain patch changes.

### Capability behavior and access

Each capability declares:

```ts
type CapabilityBehavior =
    | { effect: "query"; execution: "sync" | "operation" }
    | {
          effect: "command";
          idempotency: "natural" | "keyed" | "none";
          execution: "sync" | "operation";
      };
```

Queries do not declare idempotency: they have no business effect and are
retryable by nature. Commands must declare whether replay is naturally safe,
protected by an invocation key, or has no idempotency guarantee (`none`).
The gateway must never automatically retry a `none` command.
The binding compiler restricts GET/HEAD to queries, while POST queries remain
valid. The fixed `json-percent` scalar codec and reserved HEAD error headers
are defined in the [HTTP parameter profile](packages/features/cms-repository/fixtures/contracts/protocol-v1/http-parameters.md).

Capability access has three levels for human callers:

- `public`: anonymous callers may invoke it;
- `authenticated`: signed-in users of the public application may invoke it;
- `admin`: administrators may invoke it directly.

An administrator may invoke capabilities at every level. A signed-in user may
also invoke an `admin` capability through an assigned, published dashboard
view, but only for the calls and data its compiled grant permits. This does
not give the user administrator access outside that view. Providers are
authorized separately through approved manifest requirements; CMS runtime
system actors use a separate invocation authority, not a fourth access level.

The fixed CMS control plane—provider installation, collection installation,
site settings, and member management—remains administrator-only. It cannot
itself depend on an installed business view, or a fresh CMS would have no way
to install its first collection or provider. Business back-office access may
be delegated through published dashboards/views.

### Provider and collection configuration

There must be no `provider?: ProviderBinding` on a collection or bloc.
Collections depend on capability requirements; `ContractSelection` resolves
those requirements for the site.

There are three different configurations and they must remain separate:

1. `ProviderInstallation.configuration`: connection/account settings described
   by the approved provider manifest; secret values are credential references.
2. `CollectionInstallation.configuration`: site choices for a collection,
   validated by the collection release's configuration schema.
3. `BlocInstance.configuration`: one placed bloc's bounded JSON settings,
   validated by that bloc definition.

Using `JsonValue` for storage is acceptable only behind a declared schema and a
validator. Untyped arbitrary JSON must not become the public contract.

### CMS-owned files and image derivatives

The former standalone `cms-files` domain belongs to the CMS content aggregate:
it is the site author's file library, not a generic provider-file service. It
now lives in `@bernouy/cms-content` behind explicit subpaths rather than a
separate top-level feature merely because its bytes use different storage:

- `@bernouy/cms-content/files` for file metadata, blob ports, lifecycle,
  validation, URLs, and serving behavior;
- adapter-only subpaths for Mongo metadata and S3/local blob implementations;
- an explicit internal media/derivative module for the existing CMS-image
  optimization flow.

The `@bernouy/cms-content` root export must remain adapter-light and must not
eagerly expose Sharp, Mongo, S3, or HTTP handlers. Merging ownership does not
mean turning one root module into a dependency-heavy catch-all.

Provider-owned files remain provider data. They are downloaded through a
declared capability and the gateway; they do not become rows in the CMS file
tree merely because a page renders them. Collection-release assets are also
immutable release artifacts, not author uploads, and retain their release
identity and digest.

Do not create a broad `cms-media` package during cleanup. Keep the current
CMS-file derivative implementation inside `cms-content`. Extract a
narrow origin-neutral derivative engine only when both CMS-owned files and a
new provider file capability exercise it. That extraction may own recipes,
keys, transforms, manifests, derivative storage ports, and worker contracts;
it must not own file libraries, provider authorization, page caching, or all
HTTP caching.

CMS-authored file IDs may remain stable while their bytes change, so their
content hash is the derivative generation identity. A provider contract may
instead guarantee an immutable `fileId`. The shared engine must accept an
explicit immutable generation identity rather than assuming these two models
are identical.

### Transport and registry

- Protocol v1 supports HTTP bindings only. WebSocket, MCP, and push delivery
  wait for an actual requirement.
- A binding is authored declaratively and compiled at release time.
- Consumers address capability IDs, not provider URLs or HTTP methods.
- The CMS gateway is the only consumer/provider route.
- Official releases may initially ship as checked resource packages in this
  monorepo behind a `ReleaseCatalogue` interface.
- A remote registry service is not required for the first vertical slice.
  When added, it must use the same immutable release format and verification
  pipeline. This does not revive the deleted integration-package registry.

### Views and dashboards

- A view is a composition of collection components plus declarative capability
  calls, texts, navigation, and actions.
- A dashboard contains mounts/navigation only. It contains no widget schema
  and grants nothing beyond its mounted views.
- A site adopts a collection dashboard template as an editable site record.
- Publishing compiles and pins its execution plan for one dashboard revision.
- Assignments are direct `subjectId -> dashboardId` records. No roles or
  permission catalogue return.
- The current dashboard widgets are not migrated as a runtime. Useful visual
  patterns become ordinary generic UI components or official Ulvia collection
  blocs.

## 4. Target architecture

```text
Official resource packages / local approved resources
        |
        v
Release catalogue
  - ContractRelease
  - ProviderManifest
  - CollectionRelease
        |
        +----------------------+----------------------+
        v                      v                      v
Provider installations   Collection installs   View/dashboard installs
        |                      |                      |
        +-----------> Contract/capability resolver <-+
                               |
                               v
                         CMS Gateway
             input -> auth -> rate -> retry -> binding
             output <- projection <- validation <- provider
                               |
                               v
                    Provider installation endpoint
                               |
              +----------------+----------------+
              v                                 v
       Official Ulvia provider             Custom providers
```

The official provider is a separate service boundary. It owns its persistence,
files, background jobs, outbox, idempotency records, operations, and change
events. It does not use Supabase and does not reach another provider directly.

The catalogue domains share `@bernouy/cms-repository`: contracts and providers
exist today, alongside a first authored collections slice. Sharing a package does not merge
immutable artifacts with site installations or move gateway execution into the
catalogue domain.

## 5. Recommended workspace shape

Contracts, providers and authored collections share `@bernouy/cms-repository`.
They remain separate domains within that package. Other proposed package names
below remain subject to implementation, but their boundaries should stay stable.

### Features

- `@bernouy/cms-content`
  - remains the CMS-owned aggregate for pages, site settings, authored blocs,
    and the author file library consolidated under its `./files` subpaths;
  - exposes files, persistence adapters, serving, and image derivatives through
    explicit subpaths so the root stays light;
  - does not absorb provider-owned files or collection-release assets.
- `@bernouy/cms-repository`
  - the contracts domain owns protocol primitives, `ulvia-schema/v1`, release
    parsing, canonicalization, digests, validation, binding compilation,
    compatibility, lifecycle, mocks, conformance and `ReleaseCatalogue`;
  - the providers domain owns manifests, installations, reports, selections,
    requirements, health snapshots and credential references; manifest publication
    and comparison, local installation lifecycle, explicit graph planning and
    memory stores exist. Durable persistence, live connections and authorized
    runtime orchestration remain planned;
  - the planned collections domain owns collection releases, imports,
    configuration schemas, themes, texts, blocs, assets, compatibility,
    installations and overrides; there is no collection implementation yet;
  - immutable catalogue artifacts remain separate from site installation
    state; this package does not implement providers or mount gateway routes;
  - the root exports types only. Current entrypoints are `./contracts`, its
    `/schema`, `/bindings`, `/compatibility`, `/catalogue` and `/protocol`
    subpaths, plus `./providers`, `./providers/catalogue`,
    `./providers/compatibility`, `./providers/installations` and
    `./providers/selections`. `./collections` exposes authored release parsing,
    assets, local bloc structure and capability witness validation; its renderer,
    catalogue and installation APIs remain unimplemented.
- `@bernouy/cms-gateway`
  - invocation context, actor model, capability resolution, compiled binding
    execution, errors, projection, idempotency/retry/rate policy, audit and
    telemetry ports, operations, files, and change-feed helpers;
  - optional explicit `./http` and persistence adapter subpaths.
- `@bernouy/cms-views`
  - view definitions, dashboard manifests/site copies, assignments, compiler,
    execution plans, and repositories;
  - replaces `@bernouy/cms-dashboards` rather than extending it.
- An official-provider domain feature, named only after its first vertical
  slice proves the useful boundary. Do not put 282 handlers in a single runtime
  file tree without domain services and persistence ports.

### Resources

- One official Ulvia resource package, or a few responsibility-based packages,
  containing validated contract releases, the official provider manifest, and
  official collection releases.
- Resources are immutable data. They do not mount routes, connect to Mongo, or
  read environment variables.
- Build tooling verifies and emits canonical bundles and digests. Generated
  bundles are artifacts; authored folders remain reviewable.

### Surfaces

- `cms-control` mounts contract/provider/collection/view management APIs and
  pages through injected feature ports.
- `cms-delivery` mounts public/authenticated capability invocation and renders pages.
- A small provider HTTP surface may expose provider protocol endpoints and
  compiled capability bindings without owning official business logic.

### Runtimes

- `cms-server` composes Mongo adapters, secrets, rate limits, release resources,
  gateway clients, Control, and Delivery.
- A new `ulvia-provider` runtime composes official domain services, persistence,
  file storage, workers, and the provider HTTP surface.
- `ulvia-cli` eventually starts the local CMS, Mongo, and the local official
  provider with persistent private credentials.

## 6. Canonical records

The exact TypeScript is deferred, but Protocol v1 must be able to represent the
following records without hidden conventions.

### Contract release

- protocol and schema dialect versions;
- contract ID, SemVer, digest, and publisher in the immutable release;
- publication time and release lifecycle recorded by the catalogue;
- metadata and documentation links;
- stable capabilities with behavior, access, schemas, errors, mocks, and
  deprecation metadata requiring a reason, replacement, or sunset date;
- authored HTTP bindings and compiled binding plans;
- health declaration;
- independently versioned conformance scenarios with exact dependency profiles,
  optional scenario/profile selectors, bounded call controls, and descriptive
  aggregate/per-profile coverage reports (not execution attestations).

### Provider manifest

- provider ID, manifest version, digest, publisher, protocol range, and build
  compatibility;
- default endpoint policy and allowed endpoint origins;
- exact implemented contract releases and digests;
- required capabilities per implementation, including optional requirements;
- configuration schema, credential slots, setup capabilities, and data
  residency/retention metadata;
- declared backup format version, compatible build range, restore support, and
  same-provider relocation guarantees where applicable.

### Provider installation

- installation ID, provider manifest reference/digest, account label/reference,
  endpoint, and state;
- non-secret validated configuration and secret credential references;
- approved requirement snapshot and approval time/actor;
- CMS-to-provider and provider-to-CMS credential metadata, never raw values in
  logs or DTOs;
- selected contract releases, latest runtime report, health freshness, build,
  created/updated/revoked timestamps.

Administrative installation state is `enabled`, `disabled` or `revoked`;
revocation is terminal for that installation. The local workflow issues
ephemeral approval preparations, not durable drafts. A future transport/UI
workflow may expose draft, connecting or registration-failure stages separately.
Readiness derives from current observations and exact selections, never from
administrative enablement or a provider's blanket health claim.

### Invocation

- request ID and optional W3C trace context;
- contract release/digest and capability ID;
- target installation ID;
- origin (`delivery`, `view`, `control`, `provider`, `system`, `conformance`);
- actor (`anonymous`, `authenticated-user`, `administrator`, `provider-installation`, `system`);
- dashboard/view/revision grant when the origin is a view;
- deadline, attempt, optional idempotency key, content metadata, and input.

Provider-controlled input cannot override any context field.

### Operation

- operation ID, installation, initiating request/capability, state, progress,
  created/started/updated/completed/expiry timestamps;
- result or declared error, cancellation support, and retained idempotency
  linkage;
- states `queued`, `running`, `succeeded`, `failed`, `canceling`, `canceled`,
  and `expired` with explicit legal transitions.

### Change event and snapshot

- feed ID, event ID, installation ID, resource ID, event time, revision,
  `upsert` or `delete`, and payload/tombstone;
- opaque cursor and retention metadata on every page;
- snapshot ID, stable watermark, pagination cursor, checksum, and completion;
- at-least-once delivery and stable ordering within one feed.

### Collection release and installation

- release ID/version/digest/publisher/default locale;
- imports pinned by resolved digest;
- declared capability requirements;
- collection configuration schema/defaults;
- theme definitions, site/admin texts, blocs, assets, views, and dashboard
  templates;
- compatibility report against the preceding release;
- installation record with selected release, configuration, theme/text
  overrides, state, and update candidate.

## 7. Validation gates

Validation should be layered. A later layer never compensates for a missing
earlier one.

### Release parsing

- Reject unknown files and keys, duplicate IDs, malformed values, unsafe paths,
  and unsupported dialect/protocol versions.
- Parse every collection record as strictly as contract records. Do not cast
  JSON to interfaces.
- Canonicalize only after successful parsing and semantic validation.

### Contract publication

- Validate schema invariants and complexity budgets.
- Compile every binding exhaustively and reject collisions.
- Validate capability behavior, access, errors, content types, mocks, health,
  lifecycle, and every conformance instruction.
- Compute compatibility against the correct preceding release and every
  supported major line independently, ignoring future previews as stable
  baselines.
- Validate exact conformance dependency profiles, their transitive graph, and
  each applicable scenario. Optional `scenario.profiles` selects known profiles;
  omission applies to all and every profile needs an applicable scenario.
  Cover each exercised root requirement's support range with a matching profile
  actually calling that capability, without claiming every version or
  combination passed.
- Validate recursive literal escapes, typed object/array/map captures,
  non-overlapping assertions, keyed replay, operation completion, eventual sync
  queries and pagination according to [conformance controls](packages/features/cms-repository/fixtures/contracts/protocol-v1/conformance-controls.md).
  These are implemented static declarations; the runner still needs fresh
  disposable isolation per applicable scenario/profile pair and runtime evidence.
- Emit a canonical digest and immutable bundle.

### Provider-manifest publication

- Resolve every implemented release and digest.
- Resolve every required capability/range.
- Preserve every mandatory dependency alternative declared by implemented
  capabilities; a provider cannot narrow it or mark it optional.
- Reject self-requirements that create impossible cycles unless the protocol
  has an explicit cycle-safe rule.
- Validate endpoint policies, credential slots, configuration schemas, and
  protocol compatibility.

### Installation approval

- Show an exact diff of implemented releases, required capabilities, endpoint
  origins, credentials, and configuration changes.
- Persist the approved manifest digest and requirements.
- Refuse runtime reports that contradict the approved manifest.
- Require explicit approval for expanded authority, new origins, or a new
  manifest digest.

### Invocation

- Resolve one selected, ready installation and one pinned contract release.
- Authorize actor and origin before loading privileged provider data.
- Validate/project input, inject immutable context, apply rate and retry policy,
  execute only the compiled binding, validate status/content type/error/output,
  and project output.
- Record audit and telemetry for every outcome, including pre-provider
  refusals.

### Collection publication

- Resolve import graphs and capabilities by release/digest; reject cycles.
- Validate assets, themes, texts, configuration, blocs, slots, markup, CSS,
  behavior policy, views, dashboards, and locale completeness.
- Compile templates with a real parser and typed expression AST.
- Compile view grants conservatively and fail closed on an unprovable data or
  input flow.
- Report page/bloc/view impact for breaking upgrades.

## 8. Execution plan

Each wave should be a separate reviewable series. A wave may temporarily remove
features, but its exit condition must be testable before starting the next
dependent wave.

### Wave 0 — Protocol ADRs and executable fixtures

1. Freeze the vocabulary, versioning, schema dialect, access, behavior,
   idempotency, operation, change-feed, and configuration decisions above.
2. Select a minimal representative fixture set from UlviaInterfaces:
   - one query with pagination;
   - one keyed command;
   - one declared business error;
   - one file upload/download;
   - one provider requirement;
   - one operation;
   - one change feed and snapshot;
   - one collection bloc and one administrator view.
3. Turn expected valid and invalid cases into repository fixtures before
   porting the 12 domain contracts.
4. Record the browser-auth/CSRF policy and trusted-network policy.

Exit: interfaces describe the representative flows with no legacy Source,
role, permission, integration package, or Supabase concept.

### Wave 1 — Contract core and binding compiler

1. Implement the contracts domain in `@bernouy/cms-repository`, exposed through
   `./contracts`, with strict parsers, the schema runtime, projection,
   canonicalization, digesting, and compatibility.
2. Implement one SemVer per contract and remove capability versions from ported
   fixtures.
3. Implement the exhaustive HTTP binding compiler and negative test matrix.
4. Port mocks, health, and the conformance document model.
5. Add an in-memory/built-in `ReleaseCatalogue`; do not deploy a remote
   registry yet.
6. Add capability deprecation, publisher ownership, and catalogue-recorded
   publication time and release lifecycle.

Exit: malformed or incompatible releases cannot become catalog entries, and
runtime code has no API for executing an uncompiled binding.

### Wave 2 — Provider manifests and installations

1. Implement immutable provider manifests and their publication validator in
   the providers domain of `@bernouy/cms-repository`, exposed through `./providers`.
2. Allow distinct exact releases of one contract in a manifest, reject duplicate
   `(contractId, version)` claims, and verify every claimed digest and release.
   Manifest parsing and reference validation now support this; release-specific
   runtime conformance and installation selection still need implementation.
3. Create installation, runtime-report, requirement-approval, contract
   selection, and health models.
4. Add repositories and Mongo adapters; store secrets only through
   `cms-secrets` references.
5. Support several installations/accounts for the same provider.
6. Implement credential issue, rotation, revoke, and installation-scoped
   pairwise identity aliases.
7. Implement the installation and selection state machines. Never auto-switch
   a site's selected contract release or provider. Support a bounded overlap
   between old and new major lines until the sites using the old line migrate.

Current domain slice: manifest catalogue and comparison, explicit local
preparation/approval/modification/disable/enable/revoke, CMS-timestamped report
observations, full-site selection planning and revisioned memory stores are
implemented. Plans validate explicit choices rather than solve for versions.
Selections have a dependency-snapshot port; production composition must supply
coherent captures and mutation revisions. Catalogue approval and selection
replacement are separate operations, not an atomic multi-store upgrade.
See [provider workflows](packages/features/cms-repository/src/providers/workflows.md)
for exact V1 policies and remaining durable, network and gateway work.

Exit: a runtime report cannot increase provider authority, and disconnect or
revocation immediately removes gateway access.

### Wave 3 — Synchronous gateway vertical slice

1. Build the invocation context and actor/origin model.
2. Port the useful hardening from `cms-sources`: target validation, DNS/private
   address policy, redirect refusal/revalidation, header allow/deny lists,
   bounded bodies, timeouts, and safe error projection.
3. Execute compiled bindings only.
4. Add input/output/error/content-type validation and response-header
   allowlisting.
5. Integrate rate limiting, retry classification, deadlines, concurrency
   limits, and circuit state.
6. Add CMS audit and telemetry ports with Mongo/log adapters.
7. Mount private provider-to-CMS, public delivery, authenticated-user,
   administrator, system, and view-grant gateway entrypoints separately.

Exit: one custom provider and one official provider fixture can serve the
representative query/command flow, while malicious identity, header, origin,
redirect, and requirement expansion attempts fail.

### Wave 4 — Idempotency, operations, files, and change feeds

1. Move idempotency keys from business schemas to the invocation envelope.
2. Persist keyed-command payload hashes and results/operation IDs for the
   declared retention period.
3. Implement durable operation poll/cancel and final-result validation.
4. Define the common change-event envelope, durable cursor, tombstone,
   retention, and `CURSOR_EXPIRED` behavior.
5. Implement snapshot bootstrap with watermark and incremental catch-up.
6. Define provider-capability file metadata, immutable identity, digest,
   streaming, range, cache, expiry, revocation, and deletion behavior without
   conflating it with the CMS-owned author file tree.
7. Add provider outbox support for reliable cross-contract workflows.

Exit: restart and ambiguous-timeout tests prove no duplicated command effect,
no silently lost deletion, and recoverable long-running work.

### Wave 5 — Official Ulvia provider

Build it by vertical domain slices instead of porting 282 handlers at once:

1. Email + Forms: provider requirements, configuration/secrets, file upload,
   async delivery, and declared errors.
2. Account + Consent: subject identity, aliases, privacy export/erase, and
   retention.
3. Catalog: localization, media, public queries, snapshot/change feed, and SEO
   discovery needs.
4. Payment + Subscription + Payout: money, external events, idempotency,
   operations, and reconciliation.
5. Newsletter: bulk imports/exports, campaign operation, files, and consent
   dependencies.
6. Commerce + Negotiation + Shipment: multi-provider workflows, outbox,
   compensation, and end-to-end marketplace flows.

For every slice:

- use provider-owned persistence and durable workers;
- isolate data by installation/account;
- run conformance in a disposable tenant;
- publish an exact manifest and contract digests;
- expose actionable health;
- prove backup, restore into a clean compatible instance of the same provider,
  relocation, and deletion behavior;
- keep Supabase absent.

Auth verification/recovery email should move to the email capability only after
the system-actor flow and a bootstrap/failure policy are explicit. Do not break
account recovery merely because no provider is installed.

Exit: all official releases are served by the new provider boundary and pass
blocking conformance plus cross-contract scenarios.

### Wave 6 — Contract and provider admin experience

Replace the current Sources page with a provider-oriented control plane:

- `/admin/providers`: installations, readiness, selected contracts, health,
  and pending approvals;
- `/admin/providers/install`: official directory or custom manifest/endpoint;
- `/admin/providers/:installation`: Overview, Contracts, Requirements,
  Configuration, Credentials, Health, Operations, Audit;
- `/admin/contracts`: read-only catalogue, releases, lifecycle, provider
  candidates, selected installation, and consumers;
- `/admin/operations`: cross-provider operation status and recovery actions.

Every approval screen shows authority changes before applying them. Provider
configuration fields come from the approved manifest schema; secrets use the
existing credential picker/store without exposing values.

Exit: providers can be installed, approved, configured, selected, observed,
rotated, disabled, and removed without editing JSON or using legacy Sources.

### Wave 7 — Collections vNext core

Initial authored-bundle parsing/admission is implemented for assets and local
component/Light DOM composition definitions. It validates resource dependency
witnesses, not render execution or site installation. The remaining items below
include publication/compatibility, imports, UI resources and site workflows.

1. Add the collections domain to `@bernouy/cms-repository` with strict collection
   release parsing and immutable digest bundles; introduce `./collections` when
   this implementation exists.
2. Define collection installations, configuration, imports, update candidates,
   and override storage.
3. Keep the current Collections workspace route and general UI layout, but
   replace private/code pseudo-collections with release/install projections.
4. Add tabs for Overview, Configuration, Blocs, Theme, Texts, Views,
   Dashboards, Dependencies, and Updates.
5. Resolve capability requirements through contract selections. Never write a
   provider binding into collection data.
6. Add collection compatibility and affected-page/view reports before update.

Exit: an immutable collection release can be installed and inspected, and its
requirements report ready/missing/degraded state without invoking a provider
directly.

### Wave 8 — Bloc compiler, configuration, themes, and texts

1. Replace bespoke bloc editor bundles with bounded configuration schemas,
   defaults, presets, and declarative UI hints.
2. Store each placed bloc's configuration JSON separately from page content and
   validate it on write and render.
3. Compile light DOM, shadow DOM, slots, CSS, assets, typed expressions, and
   capability calls with real parsers.
4. Decide the behavior-code trust model before accepting `behaviour.ts`:
   official/signed-only code, a real sandbox, or no code in Protocol v1. A
   forbidden-word scan is insufficient.
5. Port theme tokens and site overrides; remove integration ownership terms.
6. Implement text definitions, locale values, parameter/plural validation,
   fallback, safe interpolation, optional sanitized rich text, and site
   overrides.
7. Integrate text and locale editing with current site languages and define
   what happens when a locale is disabled or deleted.
8. Feed contract mocks into editor previews without requiring an installed
   provider.

Exit: a collection bloc is configured with validated JSON, rendered in the
editor and Delivery, localized, themed, and previewable from mocks without
`editorJS` or a legacy source DTO.

### Wave 9 — Views, dashboards, and authorization

1. Replace widget-based dashboard views with collection-owned composition
   views.
2. Extend the declarative view grammar for queries, command forms, files,
   confirmations, navigation, invalidation/reload, and operation progress.
3. Compile typed calls and conservative output projections from an AST.
4. Pin contract and collection digests in the execution plan.
5. Keep dashboards as navigation/mounts only; allow a site to adopt, edit,
   publish, and revise a collection template.
6. Assign published dashboards directly to authenticated users.
7. Deny every view-delegated call when the dashboard is draft, stale, unassigned, or
   its plan does not prove the exact input/output access.
8. Audit every view-delegated command with subject, dashboard, view, revision,
   installation, capability, outcome, and request ID.
9. Move reusable table/detail/form/navigation/media presentation into ordinary
   components or official collection blocs, then delete the current dashboard
   widget runtime.

Exit: an authenticated user sees only assigned dashboards and can perform
exactly the calls their published views prove. An administrator retains direct
access to every capability.

### Wave 10 — Delivery, pages, media, and SEO

1. Replace the Delivery source proxy with capability gateway routes.
2. Adapt the browser binding runtime to address capabilities and compiled
   consumer requirements. Since compatibility is not required, rename
   `cms-source*` authoring attributes if a clearer `cms-call*` grammar is
   selected; do not confuse browser submit triggers with the deleted backend
   trigger system.
3. Rewrite page preflight against capability access and installed collection
   requirements.
4. Migrate dynamic page/indexing discovery from Source URNs to contract
   capabilities and explicit projections.
5. Keep the CMS-owned file library consolidated under explicit `cms-content`
   subpaths without changing its stable authoring semantics. Keep its
   content-hash-based image variants operational through the transition.
6. Replace `cms-source-images` with an origin-neutral derivative path connected
   to declared file capabilities. Port its versioned recipes, deterministic
   keys, bounded variants, durable deduplicated queue, leases/retries,
   generation-aware media index, authorization-before-disclosure rule,
   atomic writes, garbage collection, cache policies, fallbacks, and telemetry.
   Extract a shared derivative package only when the CMS-file and provider-file
   implementations prove the common boundary.
7. Preserve localized paths, redirects, canonical URLs, sitemap, robots, and
   metadata-variable behavior through the transition.
8. Add JSON-LD later as declarative, validated projections from page and
   capability data; do not put schema.org shapes into the transport protocol.
9. Use change feeds to invalidate search, sitemap, metadata, and media caches.

Exit: no Delivery or editor runtime imports `cms-sources`, and public rendering,
auth, media, indexing, and localized routing use the new gateway safely.

### Wave 11 — Provider backup, restore, and same-provider relocation

Before any production data:

1. Define two recovery layers: infrastructure backup/restore for one running
   instance, and a provider-owned, versioned tenant backup that can restore into
   a clean instance of the same provider implementation and a compatible build.
2. Include provider-owned database state, files, internal references, and the
   idempotency and operation records required for coherent recovery. Handle
   secrets through an explicit encrypted-backup, rebinding, or rotation policy;
   never silently include plaintext credentials in a tenant backup.
3. Add format and build compatibility checks, checksums, dry run, a durable
   restore operation, post-restore reconciliation, and audit.
4. Exercise offline relocation to a clean endpoint with fresh credentials,
   explicit contract-selection cutover, verification, and rollback. Never move
   a selection automatically because an instance becomes unhealthy.
5. Expose backup freshness, restore progress, reconciliation failures, and
   relocation state in Control and health.
6. Keep cross-provider data migration, live catch-up, and provider-independent
   portable snapshots out of Protocol v1. Design them later per contract, with
   at least two real provider implementations exposing the actual differences.

Exit: an official-provider installation can be restored in place and relocated
to a clean compatible instance of the same provider without silent data or file
loss, and the CMS can reconnect through new endpoint credentials deliberately.

### Wave 12 — Legacy deletion and naming cleanup

Delete only after the replacement behavior is exercised:

| Delete or rewrite | Replacement gate |
| --- | --- |
| `@bernouy/cms-sources` | Contract catalogue, installations, gateway, Control, Delivery, editor, indexing, and auth flows no longer import it |
| Source overlays and source DTOs | Provider/collection configuration and immutable contract schemas cover their surviving use cases |
| Sources admin page/runtime fragments | Provider and contract pages are complete |
| `@bernouy/cms-dashboards` | `cms-views` repositories, plans, assignments, and management UI are live |
| Dashboard widgets/runtime/browser tests | Equivalent collection components and view flows are tested |
| Source-owned theme contributions | Collection release/import ownership is active |
| Standalone `@bernouy/cms-files` package (completed before Wave 0) | CMS-owned file APIs, adapters, routes, tests, and image variants are available through explicit `cms-content` subpaths |
| `@bernouy/cms-source-images` | The provider-file derivative path passes the current recipe/key, bounded-work, durable-queue, generation, authorization, cache-policy, fallback, garbage-collection, and observability benchmarks listed above |
| Source URNs, route constants, and `/.cms/sources` | All authored and system calls use capability addressing |
| `userRole`, `admin: boolean`, role timing stages | Verified administrator identity and separately scoped view grants are complete |
| Integration/source vocabulary in docs and UI | Final repository-wide terminology audit passes |

Then remove obsolete Mongo collections, environment variables, quality
fixtures, exports, package references, docs, and dead tests. No compatibility
reader or migration is required for unshipped data.

### Wave 13 — Release tooling and hardening

1. Add author CLI commands for verify, diff, release, conformance, pack, and
   inspect using the same core libraries as CI.
2. Add signed publisher identity and remote registry distribution only when
   external publishing is needed.
3. Add dependency/SBOM, provenance, signature, and conformance attestations for
   official artifacts.
4. Add recurring disaster-recovery, same-provider backup/restore and
   relocation, retention, and key-rotation drills.
5. Run a final threat model and performance/capacity pass over gateway,
   operations, files, and provider workers.

Exit: releases are reproducible, attributable, recoverable, observable, and
safe to distribute outside the monorepo.

## 9. Testing strategy

### Protocol tests

- golden parse/canonicalize/digest fixtures;
- exhaustive invalid schema and binding fixtures;
- compatibility tests for every schema direction and lifecycle change;
- property/fuzz tests with strict complexity budgets;
- deterministic conformance capture, replay, pagination, binary, operation,
  and external-event tests.

### Gateway security tests

- unknown/rotated/revoked credentials;
- unapproved requirements and stale manifest digests;
- header/context spoofing;
- SSRF through literal hosts, DNS, redirect, IPv4/IPv6, and private ranges;
- cross-origin credential forwarding;
- CSRF and public abuse/rate limits;
- slow headers/body, large bodies, invalid UTF-8/JSON, decompression limits,
  file type/size/range, and cancellation;
- input and output prototype-pollution paths;
- concurrency, circuit breaker, retry-after, and unsafe-command no-retry.

### Durability tests

- restart between provider effect and gateway response;
- same idempotency key with same and different payloads;
- upgrade while an operation or keyed retry is in flight, preserving its
  original release and dependency selections;
- multi-contract upgrade plans with conflicting ranges, staged data migrations,
  failed cutovers and rollback without silently changing other consumers;
- operation worker crash, cancel race, expiry, and result retention;
- duplicate/out-of-order change delivery, tombstones, cursor expiry, snapshot
  catch-up, and resumption after restart;
- derivative enqueue deduplication, worker crash/lease recovery, retry backoff,
  stale-generation rejection, atomic publication, obsolete-variant collection,
  and restart recovery;
- same-provider backup and restore on the original instance, relocation into a
  clean compatible instance, corrupt or incompatible backup rejection, missing
  file detection, credential rotation, cutover failure, and rollback.

### Product tests

- provider install/approval/configuration/rotation/removal flows;
- collection install/update/configuration/text/theme flows;
- editor mock/provider preview parity;
- view plan compilation and field-level non-disclosure;
- authenticated-user assignment and stale dashboard behavior;
- public anonymous/authenticated flows;
- localized paths, redirects, sitemap, media, metadata, and later JSON-LD.

Media tests must cover both CMS-owned mutable file IDs keyed by content hash and
provider-owned immutable file IDs. They must also prove that a cached private
derivative cannot be discovered or served without a fresh authorized lookup,
and that arbitrary widths cannot create transform work.

The sandbox tests should be ported by behavior, not copied as one large suite.
Each production feature owns its unit tests; a smaller cross-package suite owns
the end-to-end contract/provider/collection scenarios.

## 10. Observability and operational policy

Every invocation should expose or record:

- request/trace ID;
- origin and actor type, with safe opaque subject/installation identifiers;
- contract version/digest, capability, installation, provider build;
- attempt, duration, result class, status/error code, bytes, rate-limit and
  circuit outcome;
- input and idempotency-key hashes where needed, never raw secrets or general
  request bodies;
- dashboard/view/revision for view-delegated calls.

Dashboards for the platform should show latency/error/rate/timeout/contract
violation counts, last success, stale health, operations, feed lag, cursor
expiry, outbox backlog, and worker failures. Audit and analytics remain separate
stores with separate retention and access policies.

## 11. Explicit non-goals

- No compatibility layer for the current source/integration/dashboard formats.
- No return of functions, backend triggers, roles, or generic permissions.
- No collection-to-provider binding.
- No provider-defined contract or self-approved requirement.
- No Supabase dependency for the official provider.
- No generic workflow engine in Protocol v1.
- No push event system before the change-feed envelope is stable.
- No WebSocket or MCP binding without a concrete product requirement.
- No remote registry deployment merely to mimic the sandbox.
- No arbitrary third-party bloc code based only on static forbidden-word scans.
- No cross-provider data migration, live migration cutover, or automatic
  provider failover in Protocol v1. Contracts, selections, and consumer data
  must nevertheless avoid embedding provider endpoints so later
  domain-specific migration remains possible.

## 12. First implementation series after approval

The safest first coding series is intentionally small:

1. ADRs and Protocol v1 types/fixtures.
2. `ulvia-schema/v1`, contract parser, validator, canonical digest, and binding
   compiler.
3. Provider manifest parser and approval diff.
4. Installation repository/state machine with secret references.
5. One synchronous gateway slice: a query, a keyed command, a declared error,
   and one approved provider-to-provider capability requirement.

Only after this series passes should the first official provider domain or any
admin UI be built. It creates the authority and execution foundation that every
later collection, view, dashboard, text, page, and SEO feature depends on.

## 13. Definition of done

The redesign is complete when:

- one immutable, digest-pinned contract model is authoritative;
- provider authority comes only from approved immutable manifests;
- multiple provider accounts/installations work;
- the gateway is the only provider route and enforces compiled bindings,
  context, access, rate, retry, idempotency, errors, audit, and telemetry;
- operations, files, snapshots, and change feeds survive restarts;
- the official provider implements the official releases without Supabase;
- official-provider data and files can be restored in place and relocated to a
  clean compatible instance of the same provider with verified reconciliation;
- collections are immutable releases with site installations and no provider
  binding;
- bloc editors are schema/configuration-driven;
- site/admin texts are localized, validated, overridable, and safe;
- views compile narrow grants and dashboards only mount/assign them;
- there are no roles or generic permissions;
- Control and Delivery contain no legacy Source path;
- localized pages, redirects, media, auth, indexing, sitemap, and SEO metadata
  still work;
- the CMS-owned file library lives under explicit `cms-content` boundaries,
  while provider files retain provider ownership;
- replacement media derivatives preserve the enumerated `cms-source-images`
  durability, authorization, cache, safety, and observability properties;
- `cms-sources`, the old dashboard runtime/widgets, and integration vocabulary
  are deleted;
- official conformance and multi-contract end-to-end suites pass in isolated
  tenants;
- the whole workspace passes `bun run check:all` with no new blocking shape or
  architecture finding.
