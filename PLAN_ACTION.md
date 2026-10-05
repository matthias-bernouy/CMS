# CmsCore Total Action Plan

**Status:** active roadmap, last reconciled with the repository and the target
architecture on 2026-10-05.

This document defines the implementation order for the next CmsCore redesign.
It is intentionally shorter than the design notes: it says what to build, in
which order, and what must be proven before the next step starts.

The architectural rationale and unresolved design details live in
[`docs/todo/control-pages-and-provider-managed-cms-instances.md`](./docs/todo/control-pages-and-provider-managed-cms-instances.md).
The current repository risks and broader hardening work are tracked in
[`docs/AUDIT.md`](./docs/AUDIT.md).

## Target Outcome

The end state is:

- every CMS is an explicit instance created or adopted by a conforming CMS
  provider;
- the first production-capable reference is the official local provider, able
  to run autonomously in Docker without Ulvia Cloud;
- Ulvia Cloud later implements the same provider lifecycle contract and routes
  the same Core contracts rather than introducing a second platform model;
- collections provide both public and administration user interfaces;
- one `Page` model represents a complete document for exactly one surface:
  either `control` or `delivery`;
- Pages on both surfaces use the same Bloc tree, settings, texts, assets,
  themes, dependency graph, migrations and editor engine;
- Blocs may support one or both surfaces;
- layouts, menus, sidebars and tabs are ordinary composition Blocs rather than
  platform-owned Dashboard or Application structures;
- CMS domain operations are official versioned contracts implemented by the
  managed Core and routed by its provider;
- Control eventually becomes a generic client that renders Control Pages from
  collections and calls Core contracts through the provider installation
  selected by its pinned execution plans;
- `Dashboard` is removed. `View` and `Application` disappear unless a later concrete
  lifecycle or authorization requirement proves that a replacement concept is
  necessary;
- the static Control application is removed; retained Control and Foundation
  components remain available while collection replacements are built.

## Non-Negotiable Invariants

These rules apply throughout the transition:

1. A Page has exactly one surface: `control` or `delivery`.
2. Page identity is stable and separate from its current route.
3. Internal links use one qualified Page reference model on both surfaces.
4. A Control Page cannot contain a Delivery-only Bloc, and conversely.
5. Collection and provider releases remain immutable and digest-pinned.
6. An execution plan pins the provider installation, contract release,
   capability, actor/site context and consuming resource; it does not duplicate
   the provider's private instance registry.
7. Provider credentials are opaque to CmsCore. The provider alone interprets
   them and determines the account, CMS instance and internal route.
8. Collection Blocs receive only their declared capabilities. They never gain
   access to arbitrary Control HTTP routes.
9. Session, CSRF, login, health, bootstrap, static assets and binary streaming
   remain kernel or transport concerns rather than artificial capabilities.
10. No current UI or persistence path is deleted before its replacement has an
    end-to-end test and a documented recovery path.

## Delivery Strategy

Implementation proceeds through small vertical slices. Each slice must be:

- useful or observable on its own;
- reversible;
- covered by focused tests and at least one cross-package flow;
- explicit about persisted-state and rollback consequences;
- committed separately when it changes a distinct responsibility;
- free from hidden dependence on Ulvia Cloud.

The legacy static Control application has intentionally been removed before
parity. The authenticated kernel now returns a clear unavailable response until
collection-based Control Pages are mounted. Existing backend APIs and retained
components remain available as migration inputs, not as a second page system.

## Phase 0 — Stabilize The Current Foundation

**Status (2026-10-05): completed by Lot 0 and its stabilization follow-up.** The
six P0 paths below now have focused failure/concurrency tests and the production
adapters have deterministic restart behavior. File-tree metadata mutations are
serialized across runtimes through a renewable MongoDB lease; migration-wide
write fencing remains scoped to the current single-runtime topology. Future
high-availability migration fencing remains separate work rather than a hidden
assumption of this gate.

Before building the new product model, fix the repository risks that could
invalidate migrations, updates or recovery:

- make CMS file metadata and byte lifecycle transitions atomic or explicitly
  recoverable;
- consume one-time authentication tokens only after the protected mutation has
  committed, or make the whole operation transactional;
- make migration write permits fail closed when their lease is lost;
- eliminate repository upload abort/commit races;
- replace the shared broad Mongo application identity with bounded identities
  appropriate to each runtime responsibility;
- enforce bounded JSON and form request bodies before parsing;
- add focused failure-injection and restart tests for these paths.

### Exit gate

- every P0 item above has an implementation test;
- interrupted writes have a deterministic recovery result;
- the workspace validation baseline remains green.

The Dashboard package, collection resource, routes, assignments and the entire
static Control application were removed before Control Pages reached parity. Do
not recreate either model.
Collection Views remain transitional until Pages and layout Blocs replace them.

## Phase 1 — Separate Provider Lifecycle From Core Contracts

**Status (2026-10-05): completed.** The provider-only namespace is fixed, Core
contract advertisements reject provider lifecycle IDs, credentials remain
opaque references, and the end-to-end plan contains no provider-private instance
target.

Keep instance lifecycle in a provider-only contract and keep Core operations in
their own data-plane contracts:

```text
ulvia.provider.cms-instances   create, list, start, backup, update and delete
ulvia.cms.*                    pages, files, collections, users and settings
```

`ulvia.provider.cms-instances` is the published ID. The architectural boundary
does not rely on parsing token claims or sharing a provider instance model.

Before adding behavior:

- characterize the existing provider installation, credential, selection,
  manifest and Gateway invocation flow;
- confirm that CmsCore treats provider credentials as opaque secret
  references;
- remove any proposed shared `ProviderInstance`, instance execution target or
  standardized Bearer claims from the design;
- keep provider instance records, observations, desired state and routing in
  provider implementations;
- keep execution plans limited to the approved provider installation, exact
  contract release, capability, consumer and CMS-owned authority context.

### Exit gate

- the provider lifecycle contract is not advertised as a Core contract;
- no Core contract can list, create, start or stop CMS instances;
- collections cannot read or replace provider credentials;
- existing provider calls retain their behavior without a second targeting or
  authentication model.

## Phase 2 — Make The Official Local Provider The Reference

**Status:** in progress. Lot 1 implements read-only discovery of the existing
local `default` instance; autonomous provisioning and lifecycle operations are
Lot 2 work.

Turn the current local composition into a real provider implementation without
prematurely splitting it into several deployable processes.

The initial local deployment may run the provider control plane and its single
CMS instance in the same image or Docker stack. The domain boundary must still
be explicit.

The smallest provider control-plane surface now consists of:

- `ulvia.provider.cms-instances/get-current`, selected entirely by the opaque
  provider credential;
- bounded `ulvia.provider.cms-instances/list` for credentials allowed to
  enumerate instances;
- instance health and exact Core/contract manifest discovery.

The local provider must:

- start without a Cloud account, token or service;
- keep a stable private `default` instance record;
- report the exact Core version and supported contract releases;
- keep instance data and provider state on documented persistent volumes;
- bootstrap the resources needed by Control without a remote repository.

### Exit gate

- a clean Docker deployment can start offline after images are available;
- Control and Delivery reach the same provider-managed local Core;
- restart preserves instance identity and data;
- backup inputs and persistent volumes are known and documented.

## Phase 3 — Prove Read-Only CMS Data-Plane Capabilities

Do not convert the whole Control API at once. Introduce one official contract
family and prove the complete authorization chain.

Start with:

- `ulvia.cms.pages/list`;
- `ulvia.cms.pages/get` if the list slice needs detail data.

For each capability:

- publish an immutable official contract release;
- implement it in the managed local Core and route it through the provider;
- compile a plan from an actual collection Bloc requirement;
- bind the plan to the provider installation, actor, site and Page/Bloc
  consumer without embedding provider-private instance identity;
- invoke it through the existing Gateway call path;
- project and validate both request and response;
- record a safe audit event;
- prove that undeclared and cross-site calls fail in Gateway, while the
  provider's own tests prove account and instance isolation for its opaque
  credentials.

### Exit gate

- a read-only collection Bloc can list CMS Pages without importing a CMS
  feature or calling a private Control route;
- contract, plan and provider installation identities agree end to end;
- changing a route or transport does not change the capability consumed by the
  Bloc.

## Phase 4 — Establish The Unified Page Model

Generalize the current page aggregate so the same document model can represent
Control and Delivery Pages while each Page retains exactly one surface.

Implement:

- `PageSurface = "control" | "delivery"`;
- collection-owned immutable Pages with generation and digest;
- site-owned editable Pages using the same document schema;
- surface compatibility validation for every nested Bloc and dependency;
- selective Page exports/imports with exact dependency generations;
- collection migration coverage for Page documents;
- copy-from-collection behavior that creates an independent site Page and
  retains only informational origin metadata.

Do not implement live inheritance or automatic three-way merging in this
phase.

### Exit gate

- the same renderer can render a minimal Control Page and Delivery Page;
- incompatible Bloc surfaces are rejected at admission and again before
  execution;
- a Page survives collection upgrade/migration with revision and digest checks;
- a copied site Page no longer changes when its origin Page upgrades.

## Phase 5 — Unify Routes And Links

Give Pages stable qualified identities and keep routing as site-owned state.

Implement:

- separate Control and Delivery route registries;
- a collection-provided default route;
- an optional site route override that upgrades never overwrite;
- one `PageReference` and one internal `PageLink` setting for both surfaces;
- route resolution from the referenced target Page and its surface;
- Delivery-specific locale, publication and redirect handling outside the
  shared Page document;
- admission checks for missing, wrong-surface and unsupported-generation Page
  references.

Do not add separate Control links, Dashboard links, Application links or route
strings embedded as the canonical relation between Pages.

### Exit gate

- Control-to-Control, Control-to-Delivery and Delivery-to-Delivery links resolve
  from the same stored reference shape;
- route overrides survive collection upgrades;
- broken references are reported before publication or activation.

## Phase 6 — Deliver The First Collection-Based Control Page

Create the first real collection-backed Control screen. The recommended slice
is a read-only Pages catalogue.

It should be composed from collection resources:

- a Control-only administration layout Bloc;
- navigation and link Blocs using ordinary Page references;
- a Pages table/list Bloc requiring `ulvia.cms.pages/list`;
- collection texts, translations, icons, assets and theme tokens;
- one collection-owned Control Page combining those Blocs.

The platform only resolves, authorizes and renders the Page. It must not know
whether the collection uses a sidebar, tabs, a header or no navigation.

### Exit gate

- the new Page works through the local provider and Gateway with no private API
  shortcut;
- keyboard, screen-reader, responsive and error-state flows are reviewed;
- the kernel unavailable/recovery response remains available when resolution fails;
- the collection Page is installable, upgradeable and removable without
  corrupting site state.

## Phase 7 — Add Mutations And The Shared Editor Carefully

Only after the read path is proven, introduce a small write capability, such as
creating or renaming a Page.

Every write must define:

- actor authorization;
- CSRF/session interaction at the host boundary;
- idempotency behavior;
- optimistic revision handling;
- audit data;
- failure recovery;
- maintenance and migration interaction.

Then adapt the shared editor engine so it can edit both Page surfaces. Reuse the
same document, settings, link, asset, text and theme controls. Surface-specific
host panels may differ; the composition model must not fork.

### Exit gate

- retries cannot duplicate mutations;
- stale revisions produce a clear conflict rather than overwrite;
- a Control Page can edit a site-owned Page through declared capabilities;
- editor output is valid for the target surface before persistence.

## Phase 8 — Rebuild Control By Functional Area

Rebuild Control one domain at a time from the retained APIs, components and
documented behavior. Likely groups are:

1. Pages and routing;
2. collections and upgrades;
3. files and media;
4. themes, texts and translations;
5. providers, instances and contracts;
6. users, authentication and site settings;
7. migrations, maintenance, backups and diagnostics.

For each area:

- define the official contracts and capabilities actually needed by its Blocs;
- implement them in the local provider;
- add collection Blocs and Pages;
- run parity, security, accessibility and recovery tests;
- mount the route only after those tests pass;
- remove superseded transitional APIs and components in separate commits.

This phase is where current Views and any required behavior from the former
Dashboard flow are translated into Pages and
composition Blocs. They must not receive a compatibility layer that becomes a
second permanent rendering system.

### Exit gate

- no Control route depends on a filesystem page scanner;
- navigation is entirely collection-authored;
- Control Pages use only declared capabilities and kernel transports;
- equivalent or intentionally changed product behavior is documented.

## Phase 9 — Remove Superseded UI Concepts

After complete parity:

- delete visual Foundation components that have collection replacements;
- remove the remaining View rendering and authoring model; Dashboard routing,
  persistence and authoring have already been removed;
- remove Application if it has no remaining independent lifecycle purpose;
- delete adapters and migrations that only supported those retired concepts;
- update package boundaries, documentation and architecture checks.

Foundation may retain genuinely generic, presentation-independent primitives.
Deletion is based on responsibility, not folder names alone.

### Exit gate

- repository searches find no active runtime dependency on the removed models;
- fresh install, upgrade, backup/restore and existing-site migration all pass;
- Control can bootstrap entirely from official collection releases bundled or
  available locally.

## Phase 10 — Complete Local Instance Lifecycle

Promote the official local provider from an execution wrapper to a complete,
production-capable instance manager.

Implement adjacent, inspectable lifecycle operations:

- create or adopt instance;
- start and stop;
- enter and leave maintenance;
- backup and verified restore;
- list available updates;
- plan an adjacent Core update;
- apply the update with the target Core migration runner;
- verify health and contract support;
- roll back runtime and data when the supported recovery policy allows it;
- delete only through an explicit, recoverable process.

Provider orchestration owns infrastructure, artifact selection, backup and
runtime transition. The target Core owns the semantic migration of its data.
Updates proceed through adjacent supported versions rather than maintaining
every possible direct migration pair.

### Exit gate

- destructive update failure has a rehearsed restore path;
- maintenance mode blocks unsafe writes for the complete migration window;
- the provider reports the new Core contract manifest only after the running
  Core transition commits;
- backup/restore is tested on realistic data, not only empty fixtures;
- the autonomous Docker experience remains fully usable without Cloud.

## Phase 11 — Ulvia Cloud, Later

Ulvia Cloud is deliberately not part of the first implementation. When the
provider lifecycle and Core data-plane contracts are stable, Cloud may
implement the same model with remote HTTP or brokered transports.

Cloud must not change collection capability syntax or Page documents. Its
additional responsibilities are operational: provisioning, fleet version
support, remote backup, monitoring, billing and strictly scoped audited
intervention.

Provider federation, cross-provider instance migration and automatic failover
remain separate future projects.

## First Concrete Implementation Series

The detailed target startup sequence is documented in
[`docs/todo/local-provider-initialization.md`](./docs/todo/local-provider-initialization.md).
Implementation is split into four bounded lots.

### Lot 0 — Safety And Existing-Flow Baseline

**Status (2026-10-05): completed.** The initial and final `check:all` baselines
are green. The provider credential path is documented and tested end to end
through the HTTP transport with an opaque reference/value. No provider
lifecycle mutation was introduced.

1. Run the workspace baseline and retain its result for final comparison.
2. Read the package-local instructions for `cms-repository`, `cms-gateway`,
   `official-provider`, `cms-server` and `ulvia-cli` before editing them.
3. Characterize one current provider call from contract and manifest admission
   through installation, opaque credential lookup, selection, plan compilation
   and Gateway invocation.
4. Add focused tests proving that CmsCore forwards provider credentials without
   interpreting their account or instance semantics.
5. Close the Phase 0 P0 correctness and security risks before enabling any new
   state-changing provider lifecycle operation. Read-only characterization and
   contract work may proceed independently, but `create`, `update`, `restore`
   and `delete` remain closed until this gate passes.

Exit gate:

- the existing provider path is source-backed and test-characterized;
- no second connection, targeting or token model has been introduced;
- new mutation paths remain unavailable;
- the workspace baseline has no task-introduced regression.

### Lot 1 — Provider-Owned Local Instance Discovery

**Status (2026-10-05): completed.** `ulvia.provider.cms-instances@1.0.0`
publishes bounded `list` and credential-selected `get-current` queries with an
independently versioned conformance suite. The official provider owns the
durable registry, registers `default` from CLI-supplied Core metadata, probes
its loopback reachability and advertises the contract through its manifest. A
cross-package test proves admission, selection, plan compilation, opaque secret
forwarding, Gateway validation and provider response end to end. No mutation
capability is open yet.

1. Confirm the final ID for the provider-only lifecycle contract currently
   called `ulvia.provider.cms-instances`.
2. Publish its smallest read-only release: bounded `list` plus either `get` or
   `get-current`, chosen from the characterized provider authentication flow.
3. Publish a separately versioned conformance suite with no endpoint,
   credential-format, Docker or persistence assumption.
4. Add a private instance registry and persistence adapter inside
   `official-provider`; do not add a shared instance record to
   `cms-repository`.
5. Register the already composed local Core as the provider's private
   `default` instance without making the provider import `cms-server`.
6. Implement lifecycle discovery and project only safe public fields.
7. Advertise the release in the official provider manifest and invoke it
   through the existing provider installation, plan and Gateway path.
8. Test first registration, restart without duplication, invalid credentials,
   inaccessible instances, unavailable Core and stale health.

Exit gate:

- the provider privately recognizes the current local Core as `default`;
- provider lifecycle discovery works through the normal contract system;
- no Core contract exposes instance lifecycle;
- CmsCore still treats credentials and instance routing as opaque;
- Control and Delivery behavior is unchanged.

The V1 local probe establishes bounded reachability, not deep Core readiness:
the current Core has no dedicated readiness endpoint. The provider marks a
failed or stale probe unavailable and keeps its last successful observation.
Lot 2 must replace this with driver-owned process/readiness reconciliation
before any lifecycle mutation is enabled.

Three boundaries also remain explicit after Lot 1:

- the filesystem registry is safe for the current single provider process, but
  it is not a multi-process database; the Lot 2 driver must remain its sole
  writer or add an inter-process lease before lifecycle mutations exist;
- the conformance suite is independently versioned, parsed and admitted, but
  suite artifacts do not yet have remote repository coordinates or a live
  runner;
- the discovered Core contract list stays empty until the first `ulvia.cms.*`
  data-plane contracts are introduced in Lot 3.

### Lot 2 — Real Autonomous Local Initialization

1. Introduce a provider-private, single-writer local runtime driver at the
   composition root; keep `official-provider` independent from the CMS runtime
   package and add a lease before allowing another writer.
2. Let the provider automatically create `default` on fresh local durable
   volumes and idempotently reuse it on restart.
3. Provision bounded database, blob and encrypted-secret adapters for the Core.
4. Start the exact Core artifact in maintenance and let the Core run its own
   persistence migrations.
5. Build and admit an offline, digest-pinned bootstrap bundle containing the
   required official contracts, `ulvia-official` and `ulvia-control`.
6. Add a one-time CMS administrator bootstrap secret distinct from provider
   administration.
7. Commit provider readiness only after migrations, stores, releases, Control
   and Delivery checks all succeed.
8. Test clean startup, interrupted initialization, failed readiness, restart,
   persistent data recovery and operation without Cloud or a live repository.

Exit gate:

- `docker compose up` on fresh durable volumes produces one ready local CMS;
- no partial initialization is reported as ready;
- restart recovers the same data, releases and CMS administrator;
- provider lifecycle administration remains available when the Core is down;
- the bootstrap flow needs no Ulvia Cloud account or service.

### Lot 3 — First Collection-Owned Control Page

1. Publish bounded read-only `ulvia.cms.pages/list` and, only if needed,
   `ulvia.cms.pages/get` Core capabilities with their conformance suites.
2. Implement those capabilities in the managed Core and route them through the
   local provider using the existing opaque credential flow.
3. Add the first `ulvia-control` read-only Bloc requiring
   `ulvia.cms.pages/list`.
4. Add one collection-owned Control Page composed from `ulvia-control` and
   selective `ulvia-official` dependencies.
5. Derive and compile its exact capability plan from the Bloc composition.
6. Render it through the minimal Control kernel.
7. Test authorization, surface compatibility, empty/error/loading states,
   keyboard use, responsive behavior, provider failure and collection rollback.
8. Keep the kernel recovery response available until the new flow has passed
   parity and restart checks.

Exit gate:

- a real collection-owned Control Page lists CMS Pages through an official
  Core contract;
- the collection imports no CMS feature and receives no provider credential;
- the provider alone determines its managed instance and internal route;
- the current administration remains recoverable;
- the workspace final validation passes.

Each responsibility should remain independently reviewable. Contract source,
conformance declarations, provider-private persistence, runtime composition,
Core implementation, collection resources and cross-package tests should not
be hidden in one large commit.

## Work Explicitly Deferred

The following work must not distract from the local vertical slice:

- Ulvia Cloud implementation;
- community collection publication;
- multi-publisher trust policy;
- high availability and automatic failover;
- cross-provider instance or data migration;
- JavaScript isolation for untrusted third-party collections;
- live Page inheritance and automatic merging;
- independent long-term Page history beyond the already planned current
  revision model;
- a new Dashboard, Application or shell abstraction;
- conversion of every HTTP endpoint into a capability.

Deferred does not mean forgotten. Security boundaries required before external
collection code, especially JavaScript isolation and CSP, remain documented
prerequisites for that later product stage.

## Global Definition Of Done

The redesign is complete when all of the following are true:

- a local provider can create or adopt and manage a CMS instance autonomously;
- provider instance identities, observations and routing remain private to the
  provider rather than being duplicated in CmsCore execution plans;
- provider lifecycle contracts remain distinct from the Core data-plane
  contracts exposed by a running CMS;
- official CMS contracts are immutable, versioned, discoverable and enforced;
- collections can provide complete Control and Delivery experiences with the
  same Page and Bloc system;
- Pages have one surface, links use stable Page references and routes remain
  site-owned state;
- every collection capability is derived, planned and authorized transitively;
- the shared editor can author both Page surfaces without two document models;
- migration maintenance, backup, restore and adjacent update flows are tested;
- static Control UI, superseded visual Foundation components, Views, the former
  Dashboard model and unnecessary Application code are gone;
- no Cloud service is required for the official local deployment;
- the entire workspace validation suite passes with no new blocking
  architecture, security or repository-shape finding.
