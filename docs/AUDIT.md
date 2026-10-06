# Repository Audit

This document records the repository-wide audit performed on 2026-10-05. It
describes the state that was verified at that time, the most important risks,
the deliberate product boundaries, and a recommended order of work. It is a
technical assessment, not a guarantee that the repository is free of defects
or security vulnerabilities.

## Executive Summary

CmsCore has a sound overall architecture. The collection, repository,
dependency, digest, generation, migration, view and provider models are more
mature than the other parts of the product. Package boundaries are enforced by
code, the test suite is broad, and the runtime composition generally respects
dependency injection.

The repository should not yet be treated as ready for a critical production
deployment, but the six original P0 weaknesses were closed in Lot 0 and its
stabilization follow-up on 2026-10-05. File mutations now have a durable recovery
journal and a cross-runtime metadata-tree lease, one-time auth tokens use
operation-bound reservation/finalization in both memory and MongoDB, migration
permits surface ownership loss, repository upload deletion is tombstoned under
its commit lock, MongoDB application credentials are site-scoped, and
public/admin request bodies are bounded before parsing.

The remaining production work is concentrated in the P1 operational and
long-lived compatibility items below rather than these original failure paths.

Lot 1 of the provider-managed redesign is also complete. The official provider
now owns a durable private local instance registry and exposes bounded discovery
through `ulvia.provider.cms-instances@1.0.0`. The existing Gateway path still
pins only installation, exact release, capability and consumer authority;
provider credentials and instance routing remain opaque.

That discovery is intentionally not a lifecycle manager yet. Its file registry
assumes one official-provider writer, its health probe proves only bounded
loopback reachability, and the independently admitted conformance suite has no
remote repository coordinate or live runner. These are explicit gates for the
autonomous local provider, not capabilities inferred from the read-only API.

## Evidence And Scope

The audit covered the 20 workspace packages, the declarative official
repository, runtime infrastructure, quality tooling, tests and current
documentation.

The following checks succeeded:

- `bun run check:all`: all seven workspace checks passed;
- `bun test`: 2,666 tests passed with no failure after Lot 1;
- dependency audit: no vulnerability was reported across 107 packages;
- `git diff --check`: no whitespace error was present;
- architecture checks: no reversed layer dependency, workspace cycle,
  undeclared subpath, cross-package source import, browser/server adapter leak or
  new environment-read violation was reported.

Four `test.failing` cases remain and deliberately document known defects:
collection build import containment, `http-runner` listener options and two
production listener-host composition cases. The former file and authentication
failure cases are now ordinary passing tests.

The automated Deep Security scan did not produce a report. Its runner refused
the configured output parent because it was group- or world-writable without a
sticky bit. The security observations in this document therefore come from
manual source review, existing tests and the dependency audit. They must not be
interpreted as an exhaustive security certification.

## Priority Map

### P0: Closed By Lot 0 And Stabilization

1. CMS file replacement, update and deletion use immutable blob pointers and a
   durable, restart-replayed mutation journal in production. Metadata tree
   commits share a renewable MongoDB lease across runtimes so delete, move and
   late-child publication cannot create an orphaned tree.
2. Authentication tokens are reserved before mutation and finalized after it;
   retries are bound to the exact operation so a finalize crash cannot authorize
   a different password.
3. Normal migration writers track heartbeat/ownership loss and local active
   writers continue blocking maintenance even after their persisted permit is
   lost. Multi-runtime fencing remains part of future high-availability work.
4. Repository abort and expiry pruning atomically move staging to a tombstone
   while holding the same commit lease.
5. The deployment provisions one `readWrite` MongoDB user per site database;
   the root credential remains infrastructure-only. The migration from an
   existing unauthenticated volume, cross-site denial and rollback were exercised
   against MongoDB 8, including the actual `mongosh` provisioning scripts.
6. JSON, form, multipart and import endpoints use bounded readers that do not
   trust `Content-Length`.

### P1: Stabilize Long-Lived Contracts And Operations

1. Version and freeze the collection browser host ABI currently exposed through
   `window.cmsRuntime`.
2. Add a general migration mechanism for internal MongoDB document schemas.
3. Exercise the implemented, startup-verified and audited KEK key-ring/DEK
   rewrap procedure in the full backup/restore production journey. The runtime
   now refuses startup when a referenced historical key is unavailable and can
   perform an explicit single-operator rotation before accepting traffic.

Collection build import containment, pending Mongo release recovery, graceful
work draining/Mongo shutdown, and separate liveness/readiness probes have been
implemented since the original audit. They remain regression-sensitive, but
are no longer open P1 design gaps.

### P2: Scale And Product Maturity

1. Materialize page-to-resource reference indexes to remove full-page scans.
2. Stream large release imports rather than hydrating every asset in memory.
3. Add durable audit events and operational metrics.
4. Add resumable, bounded-parallel CLI publication transfers.
5. Move in-process image work to a durable queue when traffic justifies it.
6. Reconcile stale documentation and package licensing metadata.

High availability, multiple publishers and third-party collection JavaScript
isolation are deliberate later concerns. They are recorded as boundaries, not
current priorities, while only official collections and a single official
publisher are accepted.

## Architecture

### Strengths

The intended dependency direction is enforced rather than merely documented:

```text
runtimes -> surfaces -> features -> foundation
```

Foundation remains free of CMS domain knowledge. Features own contracts and
domain behavior. Surfaces mount features without choosing production adapters.
Runtimes read the environment and compose MongoDB, filesystem and network
implementations. Public subpaths and browser/server boundaries are checked.

The architecture tooling catches:

- reversed dependencies and workspace cycles;
- imports through another package's source tree;
- undeclared package export subpaths;
- production adapters imported by surfaces or browser bundles;
- environment reads outside accepted composition roots;
- accidentally focused tests.

### Architecture Model Gaps

The project description still names a `resources` layer, while
`quality/architecture/core/architectureTypes.ts` currently recognizes only
`foundation`, `features`, `surfaces` and `runtimes`. The official repository is
now a declarative non-workspace tree. This should become an explicit rule:

- either `resources` is formally a declarative zone outside the workspace
  dependency graph;
- or the architecture checker should model and validate it.

`@bernouy/official-provider` is a standalone product but declares itself as a
runtime to fit the existing checker. A future `product` or `service` package
class would express the intended boundary more accurately and could restrict it
to Foundation plus selected public CMS protocols.

The runtime still uses several literal `"default"` site/scope identifiers while
the gateway can use `CMS_GATEWAY_SITE_ID`. One database per site makes this
work today, but the invariant should be formalized or replaced by one shared
runtime `CMS_SITE_ID`.

### Internal Persistence Migrations

Collection-owned data has a comprehensive migration model. Internal CMS MongoDB
documents do not yet have an equivalent general schema migration registry.
There are specialized migrations, such as page-route migration, but no common
record of component schema versions and applied migrations.

Before internal schemas become long-lived production contracts, the runtime
should support:

- versioned and idempotent feature migrations;
- single-owner execution across multiple processes;
- explicit online versus maintenance-required migrations;
- safe index changes;
- durable records of successful and failed attempts;
- backup and restore validation around incompatible migrations.

## Foundation Packages

### `@bernouy/binary-media`

Hashing and byte-signature MIME inspection are correctly centralized. Files,
collection assets and CLI scans can share one identity recipe. No urgent
structural change is required.

### `@bernouy/blob-store`

The stream/range contract and memory, local filesystem and S3 implementations
are well separated. The local implementation should document the distinction
between atomic visibility and physical crash durability: temporary-file rename
does not by itself guarantee that file and directory entries were flushed to
stable storage. S3 key-prefix normalization should also remain part of the
public adapter contract.

### `@bernouy/components`

The design system and binding runtime are mature and well tested. The `p9r-*`
namespace is the current component namespace, not a surviving EditorJS or old
provider subsystem. Renaming it would be a deliberate web-component breaking
change, not routine cleanup.

The package currently contains both the visual component library and generic
source/binding coordination. A split is only justified if their publication,
trust or consumer boundaries diverge. The `innerHTML` binding remains a trusted
sink and must continue to rely on explicit sanitation guarantees at content
admission.

### `@bernouy/envelope-crypto`

AES-GCM envelopes, per-scope DEKs and concurrent key creation are good
foundations. Persisted DEKs now carry a KEK identifier, legacy rows map safely
to `legacy`, and the runtime accepts one active key plus retained historical
unwrap keys. Explicit startup maintenance performs cursor-based, compare-and-
swap DEK rewrap, verifies key availability before and after mutation, and
writes a durable completion/failure audit without recording key material.

Operators must still exercise external key backup, loss and recovery. Rotation
is deliberately single-operator maintenance: all other CMS replicas must be
stopped. Historical keys are removed manually only after every DEK references
the active key and a later startup readiness scan succeeds.

### `@bernouy/secret-store`

Encryption is kept outside consumers and the current validation is sound.
Long-term operation will need secret versions, activation/revocation state,
rotation metadata and audit events for secret changes.

### `@bernouy/image-processing`

Pixel and timeout limits reduce image-bomb risk. Sharp still decodes hostile
input inside the CMS process, so high-volume untrusted image processing should
eventually move to a resource-limited worker or separate process.

### `@bernouy/rate-limiter`

The MongoDB fixed-window update is atomic and uses TTL indexes. Constructor
policies should consistently reject non-positive or otherwise invalid values,
even though current runtime constants are safe.

### `@bernouy/http-runner`

Correlation IDs, server timings and generic unknown-error handling are useful
cross-cutting primitives. The listener still accepts a port rather than a full
`{ port, hostname }` configuration, which prevents explicit production binding.
Public endpoints should also map known domain errors to safe response bodies
instead of relying on a generic status-bearing error message.

## Feature Packages

### `@bernouy/cms-auth`

Sessions, local credentials, personal access tokens, one-time tokens and
identity-provider contracts are separated coherently. Control's CSRF guard
checks `Origin`/`Referer`, and sessions remain server-owned.

Email verification and password reset now reserve their token, perform the
credential mutation, then finalize the reservation. A failed mutation releases
the reservation for retry. The first reservation also binds a digest of the
exact operation; after a crash or finalization failure, only the same operation
can resume, preventing a password-reset token from selecting a different value.

Additional concerns:

- `IdentityProviderPatch` can carry a changed `kind`; the feature invariant
  should reject this even if the current Control handler does not expose it;
- `ConsoleEmailer` can log bodies containing token URLs and should log metadata
  only if it is ever used outside local development;
- OIDC metadata and JWKS fetches need timeout, body limits and a gateway-like
  network policy before the dormant OIDC flow is mounted in production.

### `@bernouy/cms-collection-build`

The package has a clear responsibility: compile collection bloc code during
release preparation. Source paths are constrained, but Bun import resolution
can still resolve outside the submitted source bundle. The current callers are
trusted CLI or authenticated Control flows, so the risk is limited today. It is
a blocker before server-side builds accept untrusted authors.

The repository rules also say authored source should not self-register custom
elements, while an existing test preserves legacy `customElements.define`
behavior. The V1 contract should choose and enforce one rule rather than retain
an accidental compatibility path.

### `@bernouy/cms-content`

Page revisions, route recovery, authoring validation, read projections and
collection migration mechanics are strong. Migrations use bounded batches,
maintenance mode, resumable journals, rollback retention, stale-worker fencing
and explicit external participants.

#### File Lifecycle Atomicity

Production file mutations now persist intent before writing bytes. New content
uses immutable generation-qualified blob keys, metadata publishes the pointer
through compare-and-swap, and old bytes are removed idempotently. Deletions keep
the complete metadata/blob target set in the journal. Startup verifies pending
bytes by size and hash, then deterministically commits or discards the target.
The combined local-filesystem development adapter retains its direct path
because its metadata and bytes are the same filesystem object.

Metadata-tree critical sections are intentionally short: byte streaming happens
outside the lease, while parent validation and compare-and-swap publication run
inside it. The in-memory adapter serializes the same sections locally and the
MongoDB adapter does so across runtime processes. Direct low-level metadata
adapter calls do not receive this protection; production mutation entry points
must continue to use the file core helpers.

#### Migration Write Fence

Normal write permits now track renewal failures and missing ownership, verify
the persisted permit around the operation and propagate a 409/503 failure. In
the current single-runtime architecture, maintenance also waits for the local
writer registry, so a lost persisted permit cannot let migration overlap its
still-running writer. Compile-time exhaustive method classifications make a new
public `CmsRepository` or `CollectionStore` method fail typechecking until it is
explicitly fenced or classified. Cross-runtime fencing remains coupled to the
future high-availability design.

#### Full-Page Scans

Migrations are bounded, but ordinary flows still load all pages for some bloc
usage catalogues, file reference searches, cache invalidation, Delivery bloc
manifests and sitemap materialization. These flows will eventually need a
materialized reference graph and cursor-based projections.

The root package export remains broad and exposes both authoring and rendering
concepts. It can be narrowed when the new editor boundary is designed.

Surface routes are now scoped by site as well as surface. Collection and site
Page routes reconcile as one idempotent desired graph from their canonical
stores at startup and around writes. This removes stale ownership before path
reuse and supports route swaps. Site-owned Control Pages use the collection
Page renderer and the generic Page execution planner. Stable references are
checked at collection admission, installation, editable Page writes and
activation; destructive mutations that would orphan a known reference fail
with a conflict. The mutation coordinator is process-local: a future
multi-runtime deployment still needs a shared lease or transaction for the
canonical-state/route-projection boundary.

### Removed `@bernouy/cms-dashboards`

The package, Mongo and memory persistence, assignments, collection Dashboard
resource, activation routes, static pages and Control components have been
removed. This deliberately creates a temporary product gap before unified
Control Pages exist, but eliminates a second navigation/rendering model with no
production data to preserve. Immutable collection Pages and Page execution-plan
primitives now replace Views, and the same mounted flow also renders editable
site-owned Control Pages.

### Collection-Owned Control Domain V1

The official collection now supplies Control Pages for all seven planned
administration areas. `ulvia.cms.pages` retains the first complete mutation
slice. Six new immutable contracts cover collections, files, design, providers,
access and operations. Their handlers live in the Core runtime, the official
provider relays them generically from admitted HTTP bindings, and the Pages call
them only through exact execution plans and `/.cms/call`.

The collection Pages now expose revision-safe lifecycle mutations for
collections, files, languages/design, provider routing and access/site identity.
Authenticated file upload and replacement deliberately stay on the bounded
kernel multipart transport; collection Blocs receive no arbitrary private
Control endpoint access. Provider credentials remain inaccessible to
collections, while backup and Core process updates remain provider lifecycle
operations. Operational state is part of the Collections workspace rather than
a standalone Operations Page.

Generic child controls remain public, reusable collection Blocs. Only the
domain managers that orchestrate complete administration workspaces are
internal and absent from the author catalogue. The production Control
composition no longer mounts the legacy `/api/*` route tree or registers the
legacy administration component set. Those source files are retained only as
temporary migration reference until product parity decisions are complete.

### `@bernouy/cms-gateway`

The gateway has strong security and correctness properties:

- exact selected releases and immutable plan digests;
- input validation, output validation and output projection;
- credentials kept server-side;
- exact Page execution grants;
- HTTPS enforcement outside literal loopback development;
- validation of every resolved DNS address;
- rejection of private/non-public destinations;
- chosen-IP connection with the original TLS hostname;
- disabled redirects, bounded response size and request timeout;
- restricted forwarded headers.

The planner currently validates a selected provider/contract set rather than
solving for the best compatible set. Invocation is synchronous JSON with simple
and natural commands; keyed asynchronous operations and binary request bodies
are intentionally unsupported. Provider conformance has a substantial model
but no complete live external runner yet.

Operational improvements include durable call audit events, a clear policy for
one stale selected route in a catalogue listing, provider observation metrics,
and a durable derivative-image queue when needed.

### `@bernouy/cms-repository`

The collection and publication model is one of the strongest parts of the
repository:

- strict JSON/I-JSON and schema parsing;
- namespaced resources and explicit imports/exports;
- no dependency wildcards;
- resource digests and generations;
- SemVer/generation admission rules;
- cumulative adjacent data migrations;
- immutable artifacts and staged publication;
- HMAC request authentication with timestamp, nonce and digest;
- durable replay rejection and yanking;
- publication-time admission repeated on the server;
- metadata/binary separation for collection assets;
- indexed and paginated catalogue reads.

#### Filesystem Upload Race

Abort and expiry pruning now acquire the publication commit lease, recheck the
result/expiry, atomically rename active staging to a tombstone, and only then
delete it outside the active namespace. Startup removes abandoned tombstones.
Lock acquisition no longer recreates a staging directory that was concurrently
renamed away.

#### Mongo Release Recovery

Mongo release insertion stages a pending document, writes asset chunks and then
marks the release ready. Startup now reconciles interrupted pending releases,
removes orphaned chunks and preserves exact retries. This closes the invisible
pending-release leak identified by the original audit; fault-injection coverage
must remain part of repository regression testing.

#### Remaining Limits

- Full release reads hydrate and verify every asset, which can create memory
  pressure during concurrent imports.
- Site installation state is stored in one Mongo document and therefore has a
  hidden BSON ceiling; expose a user-facing collection count/state-size limit.
- Text size uses serialized string length rather than exact UTF-8 byte length.
- Filesystem `publishedAt` is derived from `mtime` and can change after
  copy/restore; persist an immutable publication receipt.
- Official repository asset reads do not support HTTP Range yet.
- CLI upload receipts are not persisted across process restarts and assets are
  uploaded sequentially.
- Old exact-version Page execution grants have no pruning lifecycle.

## Collections And Official Resources

### Collection Contract Strengths

The current collection format supports:

- public and internal blocs;
- native-element settings;
- typed controls and plain/rich/media/component slots;
- server texts and recursively organized metadata translations;
- recursively organized themes and tokens;
- public collection assets;
- immutable surface-specific Pages;
- transitive capabilities;
- selective imports of blocs, tokens, texts, assets and Pages;
- per-resource digests and generations;
- declarative data migrations.

Markup, default content and Page documents validate referenced blocs, texts and assets.
External CSS variables are rejected unless they are backed by an explicitly
imported token. This is the correct strict policy.

### `ulvia-official` State

The current `1.0.0` source includes 78 Blocs: 68 exported public Blocs and 10
internal helpers/managers. It also exports 119 theme tokens, 24 server texts and
10 Control Pages. Forms, layouts, navigation and content/marketing elements
already provide a credible base collection. Public child controls can be reused
inside other Pages and compositions; internal managers exist only to assemble
complete Control workspaces without polluting the author catalogue.

It is not yet a universal component catalogue. Data tables, pagination,
advanced breadcrumbs, dialogs, alerts, progress/status and empty states still
mostly exist in Foundation/Admin. They should become official product blocs
when a real site or Page needs them; Foundation components should not be moved
mechanically.

Some complex official form blocs are large. Extract shared state machines and
behavioral helpers where they improve testing and reuse, rather than splitting
files only to satisfy a line-count threshold.

Metadata translations are currently mostly English. Expanding them is best done
alongside the future persisted user locale and profile language selector.

### Browser Host ABI

Compiled collection bundles currently reference mutable global methods on
`window.cmsRuntime`. Control and Delivery initialize or extend this object. A
released immutable collection can therefore break when the CMS changes a host
method signature, even though the collection's own bytes and digest are
unchanged.

Before declaring the collection execution contract stable:

- expose an explicit version such as `window.ulviaRuntime.v1`;
- freeze or make the runtime namespace non-configurable;
- declare the required host ABI in collection admission metadata;
- keep required major ABIs side by side during transitions;
- test previously published releases against the current host.

Collection SemVer and artifact digests do not solve host ABI compatibility by
themselves.

## Surfaces

### `@bernouy/cms-control`

The active Control surface is now a small collection Page host. It protects the
shared CMS transports with authentication, administrator/member policies, CSRF
checks and collection-maintenance guards. The legacy file-routed `/api/*` tree
is not mounted. Preview documents use an iframe sandbox, restrictive CSP/nonces,
disabled connections/forms and Delivery-backed collection asset resolution.
Security headers are covered by tests.

The main limits are:

- bounded bodies are currently buffered after streaming admission rather than
  incrementally decoded;
- a large retained legacy source package with concentrated state/effect files,
  although those components are no longer registered in the production host;
- UI contract diagnostics in those retained sources, mostly imperative fetch
  usage, which disappear only when the corresponding source is deleted;
- a constructor with many positional dependencies;
- incomplete user-locale persistence and hard-coded interface labels;
- no editor, which is a deliberate current product state.

Large UI files should be split by domain state, effects and ownership only when
that separation is clearer, not mechanically by physical line count.

### `@bernouy/cms-delivery`

Delivery receives a read-only content projection and tests prevent authoring
methods from crossing that boundary. Stored HTML is sanitized, dynamic
attributes are inert until binding, and public files and collection assets use
ETag, cache controls, range handling where implemented and `nosniff`. Routing
also handles maintenance, updating, gone and redirect states.

Limits:

- page CSP is partly a meta policy; HSTS, framing and permission policies still
  depend on the deployed proxy/CDN response headers;
- `script-src 'self'` trusts all JavaScript served on the origin;
- sitemap and bloc-manifest construction retain full-page scans;
- image optimization queues are process-local and disappear on restart;
- a black-box deployment test should verify the actual public headers emitted
  after proxy/CDN configuration.

Collection JavaScript remains trusted. This is acceptable while the system only
accepts official collections and is documented as a boundary in `TODO.md`.

## Runtimes, Products And Infrastructure

### `@bernouy/cms-server`

Runtime composition correctly chooses and injects persistence/network adapters.
Listener hostnames are not yet part of the environment contract, and
`http-runner` cannot forward them. Shutdown stops surfaces but does not
explicitly close MongoDB or provide a bounded active-request drain.

### CMS Deployment

The CMS image is pinned, non-root, read-only, uses `noexec` temporary storage,
drops Linux capabilities, enables `no-new-privileges` and keeps MongoDB on an
internal network. These are strong defaults.

The deployment now provisions a distinct application user in each site
database with only `readWrite` on that database. The CMS receives that site URL
and never the infrastructure root credential. Existing installations must
follow the documented credential migration/rotation procedure; changing the
Compose template alone does not revoke a legacy broad account.

Control and Delivery currently share a process and therefore a crash/resource
fate. This is a reasonable simplicity tradeoff until independent scaling or
fault isolation is required.

### Official Repository Server

Startup validates the real storage path, rejects unsafe symlink setups, tests
write/fsync behavior, recovers upload/publication state and refreshes the index
before accepting traffic.

`/healthz` becomes a static success response after startup. A disk that becomes
read-only or corrupt is not reflected in readiness. Split process liveness from
storage/index readiness and perform a bounded live storage check.

A production deployment artifact should also supply a read-only root
filesystem, dropped capabilities, `no-new-privileges`, resource limits,
backup/restore procedures, image publication, SBOM/provenance and rollback
automation. The current single-active-replica filesystem model is a deliberate
boundary rather than an immediate defect.

### Ulvia CLI

Local and remote collection admission use the same rules. Push, pull, yank and
destructive prune behavior are explicit. Publication should later persist upload
receipts for restart recovery, upload independent assets with bounded
parallelism, and expose clearer progress and recovery diagnostics.

### Official Provider

The official provider is correctly separated as its own product. It authenticates
requests, validates capabilities and outputs, bounds submission bodies and binds
to loopback for local use.

It remains a development implementation: one local account, filesystem
submissions, no durable multi-account database, no production rate limits,
rotation, audit, callbacks, jobs, backups, deployment image or conformance
attestation. Its existence must not be interpreted as a production-ready
official provider.

## Security Assessment

### Existing Strengths

- authentication sessions and CSRF checks;
- security headers and content sanitation;
- user SVG/HTML files forced to attachment where appropriate;
- inline collection assets constrained by CSP/sandbox, MIME handling and
  `nosniff`;
- bounded collection asset counts, per-asset sizes and aggregate size;
- strong gateway SSRF controls;
- encrypted secrets and server-only provider credentials;
- signed, timestamped, replay-protected repository mutations;
- dependency audit with no reported vulnerability at the audit date;
- CI secret scanning across repository history.

### Security Work Ordered By Importance

1. Exercise KEK backup, rotation and recovery in the black-box production
   journey.
2. Version and freeze the collection browser ABI.
3. Contain collection build imports.
4. Add durable audit records for administrative and publication changes.
5. Harden OIDC remote discovery before mounting it.
6. Isolate high-volume hostile image decoding.
7. Sandbox collection JavaScript before accepting community collections.

The last item is deliberately deferred while collection JavaScript is official
and trusted.

## Performance And Scalability

Collection migrations now use cursors and bounded page batches. Their memory
shape is suitable for large datasets, though current tests prove boundedness
rather than production latency at hundreds of thousands of pages.

The next scaling investment should be a materialized reference index rather
than a broad architectural rewrite. It should support at least:

```text
page -> blocs
page -> collection resources
page -> files/assets
page -> server texts
```

This would remove repeated scans in Control catalogues, file-reference lookup,
cache invalidation, Delivery bloc manifests and sitemap work.

Other future pressure points are full asset hydration during release import,
the single-document site installation state, in-memory/process-local caches and
image queues, startup catalogue rebuilds and sequential CLI transfer.

## Testing And Delivery Quality

CI uses pinned actions, frozen dependency installation, deterministic build and
clean-tree checks, package test matrices, dependency auditing, full-history
secret scanning, coverage ratchets and image/browser smoke tests.

The most important missing test is a real black-box production journey:

1. sign and publish an official collection release;
2. pull, admit and install it in a CMS;
3. create and render cross-collection blocs, tokens, texts and assets;
4. execute an authorized provider capability from Control and later repeat it
   through the future Control Page execution plan;
5. perform a major collection migration under maintenance;
6. interrupt and resume or roll back the migration;
7. restart every process;
8. back up and restore the data;
9. verify Control and Delivery behavior and deployed security headers.

Fault-injection coverage should explicitly exercise MongoDB interruptions, disk
full/error conditions, metadata/blob partial failure, lost leases, killed
publication workers, restored repository state and old/new KEK transitions.

## Observability And Operations

Correlation IDs and `Server-Timing` provide a useful baseline. The platform
still needs structured logs, metrics and durable audit events for:

- collection install, upgrade, migration, rollback and retention cleanup;
- secret and provider changes;
- repository publication and yank;
- provider invocation failures and latency;
- image processing queue depth/failure;
- maintenance ownership and lost leases;
- administrator changes to grants and site state.

For a CMS, “who changed what and when” is both an operational requirement and a
product feature.

## Documentation And Repository Hygiene

The focused collection and provider documentation is generally
source-backed and current. Higher-level documents have drifted:

- the root `README.md` does not list all current packages/products;
- `TRANSITION_SOURCES.md` still presents some implemented view/grant/provider
  work as future work;
- `PLAN_ACTION.md` mixes historical implementation phases with current state;
- a few documentation-only EditorJS references remain;
- `cms-bloc-compile` survives only in historical audit material; the active
  package is `cms-collection-build`.

Historical documents should be clearly labelled rather than silently treated as
current architecture. `docs/TODO.md` should eventually include the operational
boundaries listed by this audit in addition to third-party JavaScript isolation.

The root declares an MIT license while many non-private package manifests use
`UNLICENSED`. The project should choose between explicitly private internal
packages and packages that inherit or declare the repository license.

Repository-shape diagnostics reported advisory large-file and directory-fanout
information but no blocking error. Large files should only be split when it
improves responsibility and readability. Mechanical splitting would make the
repository worse.

## Recommended Delivery Sequence

### Phase 1: Correctness And Security — Completed In Lot 0 And Stabilization

Immutable file transitions, operation-bound auth reservations, migration permit
loss handling, repository upload tombstones, bounded request readers and
site-scoped MongoDB users are implemented and covered by focused tests.

### Phase 2: Long-Lived Compatibility

1. Version the browser host ABI.
2. Add internal MongoDB schema migrations.
3. Exercise the implemented KEK rotation and rewrap runbook against restored
   production-like data.
4. Contain collection compiler imports.
5. Reconcile pending releases and orphaned chunks.
6. Add explicit installation-state limits.

### Phase 3: Production Confidence

1. Add the complete black-box stack journey.
2. Add deterministic fault injection for multi-step mutations.
3. Add audit events and operational metrics.
4. Add true repository readiness.
5. Implement graceful MongoDB shutdown and request draining.
6. Publish hardened minimal images with SBOM and rollback procedures.

### Phase 4: Scale

1. Materialize the page resource-reference graph.
2. Remove ordinary full-page scans.
3. Stream large collection release imports.
4. Resume interrupted CLI uploads.
5. Introduce durable image-processing queues.
6. Prune obsolete exact-version execution grants.

## Deliberate Non-Priorities

The following work should remain documented but does not need to distract from
the current priorities:

- multiple independent repository publishers;
- highly available official repository storage;
- third-party collection JavaScript sandboxing while all code remains official;
- splitting Control and Delivery into separate processes without an observed
  scaling or isolation need;
- mechanically moving Foundation components into `ulvia-official`;
- mechanically splitting files based only on physical line count;
- rebuilding an editor before provider, repository and collection foundations
  are stable.

## Final Assessment

The repository is not a fragile prototype. Its most important structural
decisions are sound, especially explicit collection imports, resource digests,
generations, migrations and the Repository/Content/Gateway separation.

The previously identified P0 multi-step file, token, migration and publication
flows now have deterministic recovery. The largest remaining confidence gap is
one complete black-box production journey with deliberate process, database and
storage interruptions. High-availability coordination, internal schema
migrations, key rotation and operational observability remain explicit future
work rather than hidden assumptions in the current single-runtime design.
