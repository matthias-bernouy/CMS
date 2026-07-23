# Admin Dashboards Improvement Plan

## Status

This document is an investigation-backed product and architecture proposal. It
does not describe an implementation already committed to the repository.

The baseline was established on 2026-07-22 by inspecting:

- the public dashboard, source, overlay, and relation contracts;
- the dashboard parser and validator;
- the `cms-control` dashboard runtime and navigation;
- all official dashboard definitions after resolving `$include` and `$files`;
- existing hand-built admin screens and data-visualization components.

The proposal intentionally covers more than new widget types. The current
system needs a reliable query model, routable admin views, and contract/runtime
parity before a larger widget catalog can remain coherent.

Unless a section explicitly describes current behavior, requirements in this
document are proposals. Counts and current-runtime findings are observations;
priorities, target contracts, and exit criteria are recommendations to approve
before implementation.

## Contents

- [Executive decision](#executive-decision)
- [Goals and non-goals](#goals)
- [Current baseline](#current-baseline)
- [Product vocabulary](#product-vocabulary)
- [Design principles](#design-principles)
- [Priority zero: contract and runtime parity](#priority-zero-contract-and-runtime-parity)
- [Target runtime model](#target-runtime-model)
- [Widget platform](#widget-platform)
- [Existing widget upgrades](#existing-widget-upgrades)
- [Priority-one widget catalog](#priority-one-widget-catalog)
- [Priority-two widget candidates](#priority-two-widget-candidates)
- [Information architecture](#information-architecture)
- [Extensions, overlays, and relations](#extensions-overlays-and-relations)
- [Authoring direction](#authoring-direction)
- [Permissions, accessibility, and internationalization](#permissions-accessibility-and-internationalization)
- [Validation and testing](#validation-and-testing-strategy)
- [Widget governance](#widget-governance-and-definition-of-done)
- [Observability and diagnostics](#observability-and-diagnostics)
- [Migration strategy](#migration-strategy)
- [Delivery matrix and roadmap](#authoritative-delivery-matrix)
- [Commerce pilot](#commerce-pilot)
- [Success measures](#success-measures)
- [Evidence map](#evidence-map)
- [Open decisions](#open-decisions)

## Executive Decision

Treat the current implementation as a declarative CRUD admin-view engine, not
yet as a complete dashboard platform.

The recommended order is:

1. Make the existing contract true in the browser.
2. Separate sources, datasets, views, widgets, and actions.
3. Introduce shared query state and a small set of high-value widgets.
4. Organize the admin around business workspaces instead of technical sources.
5. Add authoring and extensibility after the runtime model is stable.

Adding many visualization widgets before steps 1 and 2 would duplicate data
loading, formatting, errors, refresh behavior, and URL state in every widget.

## Goals

- Make every accepted dashboard property either visibly functional or rejected
  by validation.
- Support operational, analytical, configuration, and resource-management
  admin experiences without arbitrary browser code.
- Keep source credentials, endpoint execution, and sensitive mapping on the
  server.
- Allow multiple widgets to share one named dataset and one query state.
- Make filters, sort, pagination, selection, routing, and refresh predictable.
- Provide a compact, reusable widget catalog instead of many domain-specific
  one-offs.
- Make official integrations validate before installation rather than fail on
  the first user interaction.
- Preserve extension points for overlays and relations without requiring every
  extension to know the renderer internals.
- Reuse the existing admin design language and components where their data
  ownership can be separated from their presentation.

## Non-Goals

- A general-purpose BI or SQL engine in the browser.
- Arbitrary JavaScript, HTML, CSS, or remote widget bundles in integration
  resources.
- A free-form WYSIWYG canvas as the first authoring experience.
- A widget marketplace before versioning, capabilities, and security are
  defined.
- Client-side joins over large datasets.
- A large chart catalog built before tables, forms, query state, and errors are
  trustworthy.
- Replacing domain APIs with presentation expressions.

## Current Baseline

### Official definition inventory

The expanded official integration catalog currently contains:

| Item | Count |
| --- | ---: |
| Integration packages with dashboards | 8 |
| Dashboards | 19 |
| Widgets, recursively | 56 |
| `w-table` | 25 |
| `w-detail` | 27 |
| `w-navigation-list` | 3 |
| `w-tabs` | 1 |
| `w-section` | 0 |
| Detail fields | 408 |
| Readonly detail fields | 207 |
| Actions | 55 |
| Declared filters | 37 |
| Tables declaring `totalPath` | 22 |
| Tables declaring `pageSize` | 1 |
| Details declaring `status` | 21 |

Tables and details represent 52 of 56 widgets, or approximately 93% of the
catalog. No official definition contains a KPI, chart, trend, timeline, alert,
progress, health, map, or log widget because those types do not exist in the
public contract.

The root union contains only `w-table`, `w-detail`, `w-navigation-list`,
`w-section`, and `w-tabs` in
[`widgets.ts`](packages/features/cms-dashboards/src/interfaces/dashboard/widgets.ts).
The field catalog is richer and already includes lookups, schemas, media,
reorderable lists, and nested tables.

### Dominant product patterns

- Commerce is mostly collection to record: products, offers, orders, sellers,
  metadata, settings, workflow, and taxonomy.
- User Account uses table-to-detail and navigation-list-to-detail patterns.
- Newsletter is a filtered collection with export.
- Commerce Negotiation combines operational records and settings.
- Stripe Payments is a five-tab operations cockpit containing nine tables and
  seven details.
- Emailer combines templates, broadcasts, and settings.
- Mondial Relay combines shipments, projection failures, operations, and
  settings.
- BAN represents address search as a table.

Stripe Payments is the clearest pressure test. Its dashboard contains 167
detail fields, including 151 readonly fields. That density is a symptom of
missing summary, status, alert, and timeline primitives rather than a need for
larger forms.

### Existing strengths to preserve

- Dashboard resources are declarative and cannot ship scripts or HTML.
- Sources declare data-access contracts, while the source proxy executes those
  contracts and backing systems own business-data persistence.
- Endpoint references are explicit and can target another source.
- The source proxy protects credentials and applies timeout and response-size
  bounds.
- Lookups support dynamic loading, selected-value resolution, and creation.
- Details support dynamic schemas, media, conditional fields, and reorderable
  content.
- Actions support confirmation, visibility, downloads, and post-action
  navigation.
- Source overlays and relation projections can enrich installed dashboards.
- Widget data sources already expose loading, error, and retry states.
- Record selection is deep-linked through source, dashboard, collection, and
  row parameters.

These are useful foundations. The plan extends them rather than replacing them
with executable frontend plugins.

## Product Vocabulary

The current word `dashboard` covers too many concepts. The target model should
use the following vocabulary even if public type names migrate gradually.

| Concept | Responsibility |
| --- | --- |
| Source | Connector contract, endpoints, shapes, and access policy |
| Dataset | Named read model used by one or more widgets |
| Command | Explicit mutation or side-effecting operation |
| Widget | Presentation of data and local interaction affordances |
| View | Routable composition of layout, datasets, widgets, and commands |
| Workspace | Business-oriented navigation and a collection of views |

The server-side source executor/proxy performs endpoint execution with injected
adapters. Backing systems own business-data persistence; the declarative source
describes how CmsCore may access it.

A dashboard is then an overview-style view, not the umbrella term for every
collection, record form, settings page, and operations queue.

Proposed view kinds are:

- `overview`: KPIs, trends, breakdowns, alerts, and shortcuts;
- `collection`: filters, table or list, bulk operations, and creation;
- `record`: summary, fields, relations, activity, and transitions;
- `form`: settings or a command form without a selected collection row;
- `operations`: queues, health, retries, logs, and incident-oriented actions;
- `master-detail`: collection and selected record visible together.

The kind should guide defaults and authoring recipes without preventing a view
from composing different widgets.

## Design Principles

### Declarative resources, host-owned behavior

Integration resources describe configuration. CmsCore owns rendering,
execution, accessibility, security, and lifecycle behavior. A resource may
select registered capabilities but may not introduce executable frontend code.

### Sources do not define information architecture

A source is a technical connector. It must not determine where a business task
appears in navigation. Cross-source views such as Payments and Claims should
belong to a business workspace without pretending that one connector owns the
whole experience.

### Reads and commands are different contracts

Read datasets and side-effecting actions need separate types and lifecycle
rules. A data reference must not silently inherit mutation-oriented request
properties, and a dynamic overlay must never execute an effectful endpoint
while building the dashboard catalog.

### Share data before adding presentation

Widgets should consume named datasets. They should not independently fetch the
same endpoint, invent cache behavior, or encode API-specific pagination.

### Server-owned aggregation

Metrics, time series, and breakdowns should normally come from bounded
server-side read models. A chart must not download every order and aggregate it
in the browser.

### Explicit state and outcomes

Loading, refreshing, stale, empty, error, not found, permission denied, and
pending are distinct states. Actions declare their outcome instead of relying
on action-id naming conventions.

### Compile early

Installed dashboard definitions should be parsed, composed, validated, and
version-checked before users navigate to them. Unknown expressions or response
paths must not fall through as literal strings.

## Priority Zero: Contract and Runtime Parity

This phase is more urgent than adding new widget types.

### Table query controls

The contract exposes filters, `pageSize`, and `totalPath`, but the current
renderer does not expose a filter bar or pager. The table source is mounted with
an empty query context, and collection actions receive empty filters.

Required behavior:

- Render all supported filter definitions.
- Synchronize filter values with the URL.
- Debounce text search while applying selects immediately.
- Reset pagination when a filter or sort changes.
- Pass the same effective query state to the dataset and collection actions.
- Support the existing offset/limit/total pattern in the parity phase.
- Normalize pagination state so cursor pagination can be added with named
  datasets and relation paging in Phase 2.
- Display total when available and `hasMore` when total is unavailable.
- Allow a view to choose page size within declared source limits.
- Add explicit sorting with a declared set of sortable fields.
- Preserve state through record navigation and browser back/forward.
- Distinguish initial loading from background refresh.

Acceptance criteria:

- Every filter in official definitions changes the outgoing source request.
- `$search`, filter, page, and sort expressions resolve from documented state.
- Reloading a filtered URL reproduces the same collection.
- Emailer Templates no longer sends `$param.limit` or `$param.offset` as
  literal strings.
- Large collections stay bounded and do not rely on the proxy response-size
  limit as pagination.

### Table selection and actions

Checkboxes are currently rendered for every table, but selection is not
transported to actions. Selection must become functional or disappear.

Required behavior:

- Render checkboxes only when the table declares bulk capabilities.
- Track selected row keys independently from visible DOM nodes.
- Declare selection cardinality as `one`, `many`, or `all-filtered`.
- Define whether select-all means the current page or the whole filtered set.
- Pass a typed selection context to bulk commands.
- Support row actions separately from collection and bulk actions.
- Clear or preserve selection according to an explicit post-action outcome.
- Disable duplicate submissions while a command is pending.
- Announce selection changes to assistive technology.

Cardinality semantics must be explicit:

- `one` provides exactly one selected key and resource;
- `many` provides a bounded array of explicitly selected keys/resources;
- `all-filtered` provides the validated query/filter descriptor plus explicit
  exclusions and is legal only for an endpoint declaring that capability.

`all-filtered` must not be implemented by downloading every matching row into
the browser.

Acceptance criteria:

- Mondial Relay's current selected projection action receives exactly one
  selected event id until its endpoint is explicitly migrated to accept many.
- An action cannot accidentally run with a visually selected but empty runtime
  selection.
- Tables without bulk actions have no misleading checkboxes.

### Shared formatting

Date and money formats are accepted by the contract but mostly become raw text.
Formatting must be centralized and shared by tables, readonly fields, summary
widgets, metrics, charts, exports where relevant, and relation projections.

The formatter registry should cover:

- text and safe links;
- numbers with locale and precision;
- money with fixed or data-bound currency;
- percentages and ratios;
- dates, date-times, relative time, and explicit timezone policy;
- durations;
- status badges with value-to-label and value-to-tone mapping;
- media thumbnails with accessible alternatives;
- identifiers with copy behavior where appropriate;
- null, unavailable, and invalid values.

Formatting configuration belongs to presentation metadata. Canonical source
shapes should carry stable data semantics such as date, currency, enum, or
unit, while a view may override labels and display choices.

Acceptance criteria:

- Every declared table and readonly format has a renderer test.
- Money never assumes a currency silently.
- Date output has a documented timezone policy.
- Unknown enum values remain visible and do not collapse to an empty badge.

### Detail header and form lifecycle

Detail status is currently mapped and then discarded by the view. Forms also
lack a complete edit lifecycle.

Required behavior:

- Render title, status, identity metadata, and primary actions consistently.
- Validate native and schema-derived constraints before executing a command.
- Surface field-level and form-level server errors.
- Track pristine, dirty, validating, submitting, succeeded, and failed states.
- Provide reset or undo-to-loaded-value behavior.
- Warn before losing dirty changes on route, tab, or record changes.
- Scope drafts by source, workspace/view, widget, and record identity.
- Reapply visible drafts after remounting or discard them explicitly.
- Disable conflicting commands while one is pending.
- Replace native confirmations with an accessible host-owned confirmation
  pattern.
- Make command outcomes explicit: remain, refresh datasets, open a record,
  close a surface, download, or navigate.
- Remove heuristics such as interpreting an action id beginning with `delete`.

Acceptance criteria:

- Invalid required or range-constrained fields cannot be submitted.
- Hidden drafts cannot be submitted without being visible to the user.
- Two dashboards using the same collection and row ids cannot share a draft.
- Browser navigation prompts only when changes would actually be lost.
- The 21 official detail statuses are visible.

Creation should also become an explicit view state instead of depending only
on a magic row identifier. A create view should define initial values, fields
specific to creation, its cancel destination, the consuming command, and the
post-create outcome when the command returns a new identity.

### Media and reorderable content

The UI must obey declared capabilities instead of rendering all operations.

Required behavior:

- Honor single versus multiple selection.
- Expose only upload, replace, remove, and reorder operations that exist.
- Keep optimistic changes reversible and restore server state on failure.
- Provide keyboard alternatives to drag-and-drop.
- Show per-item pending, success, and error state.
- Do not emit a success toast for an undeclared or missing action.

File accept rules and media item limits are useful future additions, but they
are not part of the current media field contract and should be introduced as an
explicit, validated contract change rather than assumed by the renderer.

### Expression parity

The validator currently accepts more expression roots than the browser can
resolve. Define one canonical expression catalog with context requirements.

The target catalog should cover, where applicable:

- query values: search, filters, page, sort, range;
- route and selected record values;
- current row, resource, form field, media item, and bulk selection;
- authenticated user claims that are explicitly safe to expose;
- command input and prior command result;
- controlled time values when a definition genuinely needs them.

Each expression must declare the contexts in which it is legal. A table column
action may have a row; a dashboard-level query does not. Validation should
reject expressions used outside their context.

For compatibility, `$param.limit` and `$param.offset` should be documented
legacy aliases for the canonical page state during Phase 1. Official
definitions can later migrate to `$page.*`; the aliases must never fall through
as unresolved strings.

Acceptance criteria:

- The parser, validator, runtime resolver, and documentation derive from the
  same expression catalog.
- Unknown roots and unsafe paths fail installation.
- No unresolved expression is sent as a literal endpoint parameter.

### Unified view states

Every dataset-backed widget should use the same state vocabulary:

- `idle`: not requested because a dependency is missing;
- `loading`: first request with no usable data;
- `ready`: current data is visible;
- `refreshing`: usable data remains visible during an update;
- `stale`: visible data is older than the configured freshness policy;
- `empty`: successful request with no displayable result;
- `error`: request failed and no usable result exists;
- `not-found`: a selected resource does not exist;
- `forbidden`: the user is not allowed to read the data;
- `offline`: failure is attributable to network availability when detectable.

Empty and error states need configurable, translated titles, descriptions, and
safe calls to action. Retry should target the failed dataset rather than reload
every mounted source.

The dataset transport must preserve HTTP status and a structured failure kind.
Collapsing every non-success response into a generic `Error` cannot reliably
distinguish forbidden, not found, validation failure, timeout, and upstream
failure.

### Tabs and navigation controls

Required behavior:

- Put the selected tab in route or query state.
- Restore the tab on reload and browser back/forward.
- Use correct tab, tabpanel, `aria-selected`, and ownership relationships.
- Support arrow keys, Home, End, focus management, and disabled tabs.
- Allow tabs to be hidden by capability or permission without invalid state.
- Preserve the originating tab when opening and closing a record.

## Target Runtime Model

The intended dependency flow is:

```text
Workspace
  -> routable View
       -> shared Query State
       -> named Datasets
       -> Layout and Widgets
       -> Commands and Outcomes
            -> secure Source endpoints
```

Widgets receive data, state, formatting services, and event callbacks. They do
not directly select production adapters or reconstruct source URLs.

### Named datasets

A view should declare datasets once and let widgets reference them by id. A
dataset definition needs:

- a stable id within the view;
- a read-safe endpoint reference;
- source id when different from the view's default context;
- parameter mappings from query, route, selection, or dependency state;
- result paths or a standard response profile;
- optional transformation limited to safe field mapping;
- freshness, polling, and retry policy;
- invalidation tags;
- dependencies on other datasets or selected values;
- empty, permission, and not-found interpretation where it is unambiguous.

Inline source references can remain as a compatibility form during migration,
but the runtime should normalize them into anonymous datasets.

### Queries versus commands

Queries:

- are read-only from the dashboard runtime's perspective;
- may be cached and deduplicated;
- may refresh automatically according to policy;
- must be safe to retry;
- must honor the source endpoint's declared HTTP behavior;
- cannot be selected from mutation-only endpoints.

Commands:

- are invoked only by explicit user or host actions;
- are never executed while building navigation or materializing a catalog;
- have pending, success, error, and cancellation semantics;
- declare confirmation and permission requirements;
- declare explicit outcomes and invalidation tags;
- may return downloads or navigation targets;
- should expose idempotency support where the source provides it.

The current shared endpoint reference should evolve so a read reference cannot
silently carry an ignored mutation body or method assumption.

### Query state

Query state is owned by the view and can be read by multiple datasets and
widgets. It should include:

- search text;
- typed filters;
- sort fields and direction;
- page offset or cursor;
- page size;
- shared date or time range;
- active tab;
- selected rows where deep-linking is useful;
- optional saved-view id.

State that changes the represented resource set belongs in the URL. Ephemeral
state such as an open More menu does not. URL keys must be namespaced when a
view contains more than one independently controlled collection.

### Standard response profiles

Profiles provide conventional mappings without forcing every endpoint to emit
the same wire format.

| Profile | Minimum semantic values |
| --- | --- |
| Page | items, optional total, optional next cursor or `hasMore` |
| Item | item or not-found outcome |
| Options | value, label, optional subtitle and media |
| Metric | value, optional previous value or delta |
| Series | timestamp/category, value, optional series key |
| Breakdown | key, label, value |
| Activity | timestamp, type, title, optional actor and metadata |
| Health | severity/status, message, observed time |

An endpoint can either conform directly or declare safe paths into its result.
Profiles should drive validation, default empty states, and builder suggestions.

### Source shape enrichment

`DataShape` currently covers primitive structure, titles, required fields, and
a narrow semantic marker. It may grow additively with data semantics needed for
validation, authoring, and formatting:

- enum values and labels;
- string formats such as date, date-time, email, URL, and identifier;
- numeric units, currency, precision, and bounds;
- descriptions and examples safe for admin users;
- nullability and requiredness;
- stable semantic identities for relationships.

Endpoint capabilities are a separate contract. Filterable, sortable, pageable,
query-versus-command, sensitive input, write-only input, and secret-reference
behavior belong to source endpoint input/capability metadata rather than the
generic response `DataShape`.

Presentation overlays may refine labels, ordering, and format choices, but
should not rewrite canonical data meaning.

### Cache, deduplication, and invalidation

The runtime needs a view-scoped query coordinator with:

- stable cache keys derived from compiled definition revision, source,
  endpoint, execution scope, and resolved inputs;
- deduplication of identical in-flight queries;
- cancellation when route or dependency state changes;
- stale-while-refresh behavior;
- configurable freshness with conservative defaults;
- manual refresh and optional polling;
- invalidation by explicit tags after commands;
- retention rules when navigating collection to record and back;
- bounded cache size and lifecycle tied to the admin session.

Cache keys must include every execution boundary that can change the result,
including user, tenant, locale, or permission scope where applicable. Browser
memory is the default. Persisting admin datasets in local storage or another
durable browser cache requires an explicit data-sensitivity decision.

Commands should invalidate only affected datasets. A record update may refresh
the record, related summary, and visible collection without reloading every
source-backed widget in the page.

Data invalidation and schema invalidation are distinct. Dataset tags mark query
results stale and refetch active consumers. The existing source endpoint effect
that invalidates schema must reload affected sources, overlays, and compiled
definitions and advance their revision.

### Cross-source views

Cross-source views are first-class. They require:

- validation of every referenced source and endpoint, not only the primary
  source;
- per-source permission checks;
- diagnostics identifying the exact dataset and reference that failed;
- explicit dependency behavior when one source is unavailable;
- no client-side access to source credentials or private endpoint metadata;
- bounded composition rather than unstructured browser joins.

A workspace or view may have a default source for concise definitions, but its
navigation identity must not be derived from that default.

### Catalog API split

The current dashboard list response contains every source's endpoint DTOs,
dashboards, overlays, and relation projections. Navigation and the view can
fetch the same large response independently.

Replace that shape gradually with three responsibilities:

1. A lightweight workspace/view catalog for navigation.
2. A lazy resolved definition for the selected view.
3. A client-safe source capability description only when authoring or runtime
   mapping needs it.

Exact routes are an implementation decision, but the behavior should include:

- one shared browser store for navigation and the active view;
- revision or ETag support;
- cached composition of overlays and relation contributions;
- no target URLs, secrets, or irrelevant endpoint metadata in catalog payloads;
- catalog-summary size proportional to visible view summaries;
- lazy definition size proportional to the selected view rather than all
  installed definitions.

Listing navigation summaries must not execute dynamic overlay field-source
endpoints. Dynamic overlay data belongs in compilation or lazy selected-view
resolution, must use a read-safe endpoint, and should be cached by definition
and source revision.

### Security guardrails

- Keep endpoint execution behind the source proxy.
- Keep forbidden-header filtering, timeouts, and response-size limits.
- Enforce permissions server-side; hidden UI is not authorization.
- Restrict dataset endpoints to declared read-safe capabilities.
- Restrict dynamic overlay field sources to read-safe endpoints.
- Redact secrets and sensitive values from diagnostics and previews.
- Validate all paths against prototype-pollution and unsafe traversal rules.
- Never evaluate expressions as JavaScript.
- Do not allow resource packages to provide renderer modules.
- Audit command execution with source, endpoint, user, view, and outcome context.

Before endpoint operation classification exists, dynamic overlay field sources
need a conservative compatibility guard: GET only, no declared effects, no
computed params or headers, and the same dedicated authorization expected for
schema metadata. Operation classification should later replace this heuristic
with an explicit read-only schema/query capability.

## Widget Platform

### Host-owned widget registry

The current closed union requires parallel changes in the public contract,
integration parser, validator, runtime mount switch, and several recursive
walkers. Introduce one canonical host-owned widget specification registry.

Each registered widget specification should define:

- public type name and version;
- configuration schema and defaults;
- normalization from supported legacy forms;
- dataset profile and capability requirements;
- expression contexts it exposes;
- reference, action, and dependency collection;
- renderer identity;
- supported loading and interaction states;
- layout constraints;
- authoring metadata and examples;
- accessibility obligations;
- migration hooks between supported versions.

The registry should generate or drive parsing, validation, JSON Schema,
documentation, fixtures, and compatibility diagnostics. It must not turn
integration resources into executable plugins.

### Version and capability model

Add a dashboard schema version and explicit capability requirements. The
existing `requires` field should either become a validated capability contract
or be removed.

At installation or composition time:

- reject unsupported major schema versions;
- validate required widgets and formatter capabilities;
- allow additive minor capabilities where safe;
- report the integration, dashboard, view, widget, and property responsible;
- never render an unsupported widget as an unexplained blank region.

### One canonical tree walker

Sections and tabs are traversed independently by selection, action, lookup, and
relation logic. Replace these copies with one canonical visitor capable of:

- walking structural and visual nodes;
- locating ids with provenance;
- collecting datasets, actions, expressions, and extension slots;
- validating uniqueness and allowed nesting;
- transforming a composed tree immutably;
- supporting future layout nodes without duplicating recursion.

### Layout primitives

The current root layout is a vertical stack. The initial layout system should
remain constrained and responsive:

- stack with configurable gap;
- responsive grid with spans and minimum widths;
- main and side regions;
- section/card grouping;
- tabs with URL state;
- collapsible region or accordion where information density requires it;
- split or master-detail presentation;
- visibility based on permission, capability, and safe conditions.

Definitions should express intent rather than raw CSS. Breakpoints, focus order,
and mobile collapse behavior remain host-owned.

### Widget interaction model

Widgets may emit a small set of declarative intents:

- update shared query state;
- select or open a record;
- open a route, drawer, modal, or split-panel target;
- invoke a declared command;
- download a command result;
- apply a drilldown filter;
- request refresh for specific datasets.

Widgets must not reach into another widget's DOM. Cross-widget interaction
flows through query state, selection state, routes, and declared intents.

## Existing Widget Upgrades

### Table v2

Table v2 is the highest-value widget investment.

Capabilities:

- filters, search, sort, offset/cursor pagination, and total;
- responsive column priorities and horizontal overflow policy;
- row, collection, and bulk actions;
- optional inline editing with explicit save/cancel lifecycle;
- functional selection with page/all-filtered semantics;
- configurable empty state and creation CTA;
- column formatting through the shared registry;
- column visibility and density preferences where permitted;
- loading skeleton, refreshing indicator, retry, and stale state;
- keyboard navigation and accessible selection labels;
- stable return position after opening a record.

Table v2 should not become a client-side spreadsheet. Complex joins,
aggregation, and unbounded local filtering remain source responsibilities.

### Detail v2

Capabilities:

- summary header with identity, status, metadata, and actions;
- main/side responsive regions;
- validation, dirty state, reset, pending, and navigation guard;
- configurable sections with collapse behavior;
- consistent readonly formatting;
- explicit relations and activity slots;
- drawer, route, modal, and split-panel presentation modes;
- not-found and permission states;
- predictable focus placement after navigation and validation failure.

### Navigation list v2

Capabilities:

- search and optional grouping;
- accessible reordering with keyboard alternatives;
- explicit active item and route state;
- status/badge formatting;
- contextual and row actions;
- empty, error, and pending states;
- optional virtualization only after a measured need.

### Tabs and sections

- Tabs are structural nodes with complete accessibility and route state.
- Sections support description, status, actions, empty state, and collapse.
- Both participate in the canonical tree walker and extension-slot model.
- Hidden children do not leave invalid active-tab or focus state.

## Priority-One Widget Catalog

The first new catalog should be deliberately small. Six data-display widgets
plus one action-form primitive cover most of the missing dashboard vocabulary.

The existing `p9r-stat`, line-chart, bar-list, and range components are useful
visual references, not drop-in data widgets. Their current direct-fetch and
error-to-empty behavior must be separated from presentation before reuse in the
shared dataset runtime.

### `w-stat`

Purpose: answer one important numeric question at a glance.

Minimum capabilities:

- label, current value, unit, and formatter;
- optional previous value, delta, and trend direction;
- optional compact sparkline from a compatible series dataset;
- status tone and explanatory text;
- drilldown intent that updates query state or opens a view;
- loading, unavailable, stale, and error presentation.

Initial uses: order count, gross volume, active sellers, open claims, failed
shipments, subscriber growth, and delivery success rate.

### `w-time-series`

Purpose: show change over time rather than a current total.

Minimum capabilities:

- one or a small bounded number of series;
- line and area presentation;
- date/time x-axis and formatted numeric y-axis;
- shared range control integration;
- missing-point and timezone policy;
- accessible tabular summary or equivalent description;
- hover/focus detail and drilldown intent;
- empty, partial, stale, and error states.

Initial uses: orders, revenue, subscriptions, payments, refunds, and shipment
exceptions over time.

### `w-breakdown`

Purpose: compare categories or statuses.

Minimum capabilities:

- bar-list presentation first, with bar chart as an alternate host rendering;
- label, value, share, formatter, and optional tone;
- deterministic sort and an explicit `other` policy;
- click or keyboard drilldown into a shared filter;
- accessible values without relying on color alone.

Initial uses: orders by status, claims by reason, payments by outcome, products
by visibility, and shipments by carrier state.

### `w-summary`

Purpose: replace long readonly forms with compact, structured information.

Minimum capabilities:

- key/value rows using the formatter registry;
- optional groups, description, status, and icon;
- safe links and copyable identifiers;
- relation summaries and explicit navigation intents;
- responsive one/two-column layout;
- field-level unavailable state.

Initial uses: payment identity, customer and seller summaries, order totals,
shipping metadata, integration configuration, and relation projections.

### `w-alert` / `w-health`

Purpose: expose conditions that require attention.

Minimum capabilities:

- severity, title, message, observed time, and optional count;
- one or more safe navigation or command actions;
- single condition and bounded list modes;
- acknowledgement only when backed by an explicit command;
- resolved, stale, and permission states;
- no severity communication by color alone.

Initial uses: failed projections, payment disputes, source failures, incomplete
configuration, expiring credentials, and stuck workflows.

### `w-timeline`

Purpose: explain how a resource or operation reached its current state.

Minimum capabilities:

- timestamp, type, title, description, actor, and optional metadata;
- grouping by date and stable ordering;
- pagination or cursor loading;
- links to related records;
- optional command actions on eligible events;
- empty, partial, and failed-page states;
- redaction of sensitive event payloads.

Initial uses: order transitions, payment/refund/dispute events, shipment status,
integration runs, audit history, and negotiation activity.

### `w-action-form`

Purpose: represent settings and bounded commands that are not naturally a
selected resource detail.

Minimum capabilities:

- typed fields inferred or validated against command input metadata;
- optional read dataset for current settings or defaults;
- required, bounds, format, cross-field, and server-error validation;
- safe secret-reference input that never rehydrates secret material;
- dirty, reset, confirming, pending, success, and error states;
- one explicit consuming command and optional secondary safe commands;
- explicit success outcome and targeted invalidation;
- create/update mode semantics without a magic record id;
- accessible error summary and focus management.

Initial uses: Commerce settings, payment/provider configuration, Emailer
settings, Mondial Relay settings, and bounded operational command runners.

This widget is not a general workflow engine or an arbitrary HTTP request
builder.

### Adjacent priority-one primitives

These are valuable after the six core widgets or when a pilot requires them:

- shared range/filter control bar;
- status/progress/stepper for workflows and long-running operations;
- activity/resource list for lightweight feeds;
- contextual callout and empty-state primitives;
- explicit relation summary/list presentation.

## Priority-Two Widget Candidates

Add these only in response to validated domain use cases:

- hierarchy/tree for commerce taxonomy;
- kanban for workflows with a stable transition model;
- JSON, code, log, and diff viewers for technical operations;
- gallery and file/download collection;
- calendar for scheduling domains;
- map/location for BAN and delivery;
- rich text or markdown rendering with strict sanitization;
- compare view for records or revisions;
- pivot-like summaries only when a bounded server-side profile exists.

Do not prioritize pie charts, gauges, or maps merely to make the catalog appear
larger. Stat, trend, breakdown, alert, and timeline cover more current use cases
with less specialized behavior.

## Information Architecture

### Business workspaces

Replace the primary source-oriented navigation with business workspaces.

A workspace needs:

- stable id and translated label;
- icon and optional description;
- category and explicit order;
- keywords for search;
- view groups and view order;
- optional health/count badges backed by bounded datasets;
- permissions or capability requirements;
- contribution provenance;
- optional default view.

A proposed Commerce workspace is:

```text
Commerce
  Overview
  Catalogue
    Products
    Offers
    Taxonomy
  Sales
    Orders
    Sellers
  Protection and Payments
    Payments
    Claims and Disputes
    Negotiations
  Delivery
    Shipments
    Exceptions
  Configuration
    Commerce settings
    Payment settings
    Delivery settings
```

The Sources area remains available as a technical explorer for endpoint and
connector diagnostics. It is no longer the default mental model for business
users.

### Routing

Routes should identify workspace, view, optional record, tab, and meaningful
query state. A selected record must not require scanning widget definitions to
infer which detail to mount.

The route model should support:

- direct links to a workspace view;
- direct links to records and meaningful tabs;
- browser back/forward across filters and selection;
- explicit presentation target: route, drawer, modal, or split panel;
- stable return to collection query and scroll state;
- migration aliases for existing `/admin/sources` links.

### Discovery and personalization

Later workspace navigation may support:

- global view search;
- favorites and recent views;
- saved filters and column preferences;
- role-specific defaults;
- source/integration provenance for administrators;
- health badges and degraded-source indicators.

Personalization must not mutate the installed integration definition. It is a
separate user or site preference layer with reset and migration behavior.

## Extensions, Overlays, and Relations

The current overlay system can add primitive fields and columns, while relation
projections declare table, summary, or link presentation but the browser only
fully supports a subset. Replace special cases gradually with declarative view
contributions.

### Contribution slots

Views and widgets may expose named slots such as:

- workspace navigation group;
- overview region;
- collection filters, columns, row actions, and bulk actions;
- record summary, main, side, tab, and activity;
- settings section;
- operations alert region.

An extension contribution should declare:

- target workspace/view/widget and slot;
- stable contribution id and provenance;
- placement order or before/after anchor;
- capability and permission requirements;
- datasets and commands it adds;
- collision behavior;
- version compatibility.

The fully composed view must be validated again. Duplicate ids, missing slots,
incompatible profiles, ambiguous ordering, and unsupported capabilities should
produce installation diagnostics rather than silent omission.

### Relation presentation

Relation projections should use the same registered widgets and datasets as
ordinary views:

- table for many related records;
- summary for one or a compact related identity;
- link when only navigation is required;
- tab placement when the target view exposes a compatible tab slot;
- cursor/offset semantics from the relation page contract;
- executable actions with their endpoint identity preserved.

This removes a parallel renderer path and makes relation states, formats,
pagination, and actions consistent with the rest of the dashboard platform.

## Authoring Direction

### Start source-first and recipe-first

Do not begin with a free-position canvas. The first builder should guide an
author through valid source contracts:

1. Select a workspace and view recipe.
2. Select a source and read-safe endpoint.
3. Inspect input/output shapes and a redacted example or fixture.
4. Choose a response profile or map result paths.
5. Generate initial fields, columns, and format suggestions.
6. Configure query state and pagination.
7. Add widgets that are compatible with the dataset profile.
8. Configure commands, confirmations, permissions, and outcomes.
9. Preview desktop and mobile states.
10. Compile and validate before publishing.

Initial recipes:

- analytical overview;
- collection to record;
- settings form;
- operations queue;
- master-detail;
- resource timeline.

### Builder capabilities after the runtime stabilizes

- view tree and property inspector;
- schema path picker with type compatibility;
- live request inspector with secret redaction;
- fixtures for deterministic preview;
- previews for loading, refreshing, empty, error, forbidden, and stale states;
- desktop, tablet, and mobile preview;
- action and expression diagnostics;
- draft, publish, version, diff, and rollback;
- duplication and reusable recipes;
- integration/site/user provenance;
- schema-drift diagnostics when a source changes;
- generated documentation for widget and profile capabilities.

`flattenDataShape` and existing source shape metadata can seed field and column
suggestions, but generated configuration must remain editable and validated.

## Permissions, Accessibility, and Internationalization

### Permissions

- Check view, dataset, widget contribution, and command permissions server-side.
- Allow the UI to hide or disable unavailable actions for clarity, never as the
  enforcement mechanism.
- Distinguish forbidden from missing and failed data.
- Prevent a contribution from widening access to its target view.
- Include permission context in validation and preview fixtures.

### Accessibility

- All widgets must define keyboard and focus behavior before registration.
- Charts need textual values or an equivalent accessible representation.
- Tables need accessible selection, sort, pagination, and action labels.
- Drag-and-drop requires keyboard alternatives.
- Status and severity cannot rely only on color.
- Dynamic refreshes and command outcomes need appropriate announcements.
- Drawer/modal/route transitions need deterministic focus placement and return.
- Automated checks supplement, not replace, keyboard and screen-reader review.

### Internationalization

- Resource definitions should use translation keys or a clearly versioned
  localization mechanism instead of assuming one display language.
- The host owns locale-aware number, currency, date, and relative-time output.
- Source data and identifiers remain locale-independent.
- Empty, error, validation, and action-state messages use the same translation
  system as normal labels.
- Layouts must tolerate longer translated labels.

## Validation and Testing Strategy

### Definition compiler

Compile the complete composed definition at installation and when overlays,
relations, or source capabilities change.

Validation should cover:

- schema and widget versions;
- unique ids across the relevant scopes;
- legal structural nesting;
- every primary and cross-source endpoint reference;
- query versus command endpoint capability;
- required endpoint params and body values;
- unexpected params and body values;
- response path existence and type compatibility;
- profile-to-widget compatibility;
- expression root, path, context, and result type;
- formatter requirements such as money currency;
- query dependencies and cycles;
- bounded tree depth, total nodes, children per container, fields, options,
  datasets, dependencies, expression-map entries, and polling/concurrency
  values;
- layout and slot compatibility;
- action outcomes and invalidation targets;
- permission/capability requirements;
- overlay and contribution collisions.

Diagnostics need source provenance: integration, artifact file, dashboard/view,
dataset/widget/action, and property path.

Compilation can prove that a required endpoint input has a binding, but a
runtime expression may still resolve to `undefined`, an empty invalid value, or
an out-of-bounds page size. Every query and command therefore needs a final
typed preflight validation of resolved required values before proxy execution.

### Test layers

1. Contract tests for parsing, normalization, validation, and versioning.
2. Runtime tests for every accepted property and expression.
3. Widget tests for all standard states and interactions.
4. Query coordinator tests for deduplication, cancellation, stale behavior, and
   targeted invalidation.
5. Full official-definition compilation tests after include expansion and
   contribution composition.
6. End-to-end tests for collection, record, action, browser history, and
   cross-source flows.
7. Visual tests for representative desktop and mobile views.
8. Accessibility tests plus manual keyboard scenarios.
9. Security tests for path safety, endpoint capability, permission enforcement,
   redaction, and malicious definitions.
10. Performance tests for catalog size, large collections, repeated datasets,
    and route transitions.

### Contract-to-renderer parity matrix

Maintain a generated or reviewed matrix mapping each public property to:

- parser support;
- validation rules;
- runtime behavior;
- renderer behavior;
- tests;
- authoring documentation.

An accepted property with no observable runtime behavior is a release-blocking
gap. This directly prevents repeats of filters, formats, and detail status being
accepted but ignored.

### Official scenario fixtures

Keep a small resolved fixture set representing real complexity:

- Commerce Products for filters and collection-to-record;
- Commerce Orders for money, status, actions, and relations;
- Stripe Payments for tabs and cross-source operations;
- Mondial Relay for bulk selection and operational errors;
- Emailer Templates for pagination and settings;
- Commerce Taxonomy for hierarchy and reordering.

The fixtures should cover loading, success, empty, partial, forbidden, and error
responses without requiring live third-party services.

## Widget Governance and Definition of Done

Every widget and material contract capability should carry a maturity level:

- `experimental`: API and visuals may change; not used by stable external
  resources;
- `beta`: versioned and used by at least one official pilot, with migrations
  still permitted;
- `stable`: compatibility, deprecation, and migration guarantees apply.

A widget or contract property cannot become stable until it has:

- a documented user problem and at least one real official-integration use
  case;
- a schema, defaults, source profile, and compatibility version;
- a complete state matrix;
- defined query, action, selection, and invalidation behavior;
- responsive layout and overflow behavior;
- keyboard, focus, semantics, and screen-reader expectations;
- security and permission analysis;
- parser, validator, runtime, renderer, and authoring documentation support;
- success, empty, failure, stale, forbidden, and relevant partial-state
  fixtures;
- contract, runtime, visual, and accessibility tests;
- a migration and deprecation story for future breaking changes;
- no accepted property that is silently ignored.

New widgets should be justified by a reusable interaction or information
pattern. A visual variation that consumes the same profile and has the same
semantics should normally be a host-owned presentation option, not another
public widget type.

## Observability and Diagnostics

Administrators and authors need enough information to diagnose a broken view
without exposing secrets.

Provide, progressively:

- dataset id, source, endpoint, status, duration, and last refresh;
- resolved non-sensitive query state;
- cache hit, deduplicated request, retry, and invalidation information;
- command status and explicit outcome;
- definition provenance and composed contribution list;
- schema/version mismatch diagnostics;
- redacted request/response preview in authoring mode;
- server logs correlating view dataset requests and commands.

User-facing errors remain concise. Detailed diagnostics belong in an
administrator or author surface and server logs.

## Migration Strategy

### Compatibility approach

- Add an explicit schema version before introducing the dataset-first contract.
- Treat current definitions as a documented legacy version.
- Normalize legacy inline widget sources into anonymous datasets internally.
- Fix P0 renderer gaps for existing definitions rather than requiring an
  immediate resource migration.
- Introduce new workspaces and views behind a compatibility adapter.
- Keep aliases for existing deep links during the migration window.
- Revalidate the resolved definition after applying overlays and relations.
- Migrate one representative workspace before changing all official resources.
- Remove legacy normalization only after official and supported external
  definitions have a migration path.

### Legacy `WIDGET_PLAN.md`

The previous widget plan captured several principles worth retaining:

- source contracts declare persistence and media operations, while the
  server-side executor performs them;
- dashboard widgets translate events into declared endpoint calls;
- static options and dynamic lookups are distinct;
- selected lookup identity and display resolution are distinct;
- action placement should be explicit;
- resource definitions must not revive the old string-rendered action runtime.

Several historical proposals should not be restored literally:

- old unprefixed widget tags must not replace the current `w-*` vocabulary;
- current endpoint references must not be reverted from `endpoint` plus an
  optional `sourceId` to the older `id` shape;
- actions may be navigation- or selection-only and therefore do not always
  require an endpoint;
- action placement must not depend on implicit button-count heuristics;
- the expression model must not remain an untyped string free-for-all;
- the nested-resource editing need, especially product variants, should be
  preserved without committing to the old proposed `nested-list` syntax;
- current chart components must not bypass named datasets by fetching their own
  URLs.

It predates the current implemented contract and focuses on widget-local source
calls. This plan supersedes it by adding datasets, shared query state,
workspaces, validation, state semantics, and an extensibility model. The deleted
plan should not be restored as a parallel source of truth merely to preserve
those ideas.

## Authoritative Delivery Matrix

The thematic sections above describe the target in depth. This matrix and the
roadmap below are authoritative for delivery order when a capability appears in
several sections.

| Capability | Delivery phase | Completion signal |
| --- | --- | --- |
| Governance gates and compatibility decisions | Phase 0 | Maturity and Definition-of-Done rules apply to every later capability |
| Minimal anonymous-dataset request/state core | Phase 1 | Current filters, page state, tabs, retry, and cancellation share one lifecycle |
| Existing table/detail/media/expression parity | Phase 1 | Official definitions no longer contain accepted runtime no-ops |
| Runtime-safe endpoint DTO and overlay read guard | Phase 1 | Visitor catalog payloads expose no upstream request configuration and listing is non-effectful |
| Named datasets, profiles, query/command classification | Phase 2 | Shared typed data is compiled independently from widgets |
| Query cache, deduplication, and targeted invalidation | Phase 2 | Duplicate reads collapse and commands refresh only affected data |
| Host-owned widget registry and tree walker | Phase 2 | New widgets no longer require parallel manual switch updates |
| Lazy catalog, cross-source compilation, and contributions | Phase 2 | Selected-view payloads and composed definitions are bounded and validated |
| Layout, six core data widgets, and `w-action-form` | Phase 3 | Commerce can provide real overview, operations, and configuration views |
| Business workspaces and explicit presentation routes | Phase 3 | Normal Commerce navigation no longer depends on the Sources hierarchy |
| Builder metadata, publishing, and personalization | Phase 4 | Authors can produce and govern validated definitions without renderer changes |

## Delivery Roadmap

### Phase 0: Lock the baseline and decisions

Deliverables:

- accepted vocabulary for source, dataset, command, widget, view, and workspace;
- contract-to-renderer parity inventory;
- expression capability inventory;
- documented query-state and route semantics;
- decision on schema versioning and compatibility duration;
- resolved official scenario fixtures;
- adoption of the maturity levels and Definition-of-Done gates in this plan.

Exit criteria:

- all current ignored properties are classified as implement, migrate, or
  reject;
- no new widget type is added through another uncoordinated switch path;
- open architectural decisions blocking Table v2 are resolved.

### Phase 1: Make the current contract trustworthy

Deliverables:

- a minimal request/state coordinator that normalizes current widget source
  references into anonymous datasets;
- Table v2 filters, search, offset/limit pagination, total, sorting, and
  functional cardinality-aware selection;
- shared formatter registry;
- visible detail status;
- form validation, explicit create state, dirty state, reset, pending, and
  scoped drafts;
- media capability enforcement and failure recovery;
- canonical expression catalog and parity, including `$param` compatibility
  aliases;
- accessible tabs with URL state;
- status-aware error transport, unified states, cancellation, and targeted
  retry for anonymous datasets;
- explicit action outcomes;
- a runtime-safe endpoint execution DTO that excludes upstream target URLs,
  configured headers, secret references, and irrelevant source metadata;
- a conservative GET/no-effects/no-computed-input guard for dynamic overlay
  field sources until operation classification exists.

Exit criteria:

- all official filters and pagination declarations work end to end;
- every accepted format has visible tested behavior;
- all official detail statuses render;
- selected-row actions receive the correct selection;
- invalid forms and duplicate commands are blocked;
- parity tests prevent accepted no-op properties;
- `$param.limit` and `$param.offset` cannot reach an endpoint as literals;
- visitor dashboard payloads contain no upstream request configuration;
- listing navigation cannot invoke an effectful overlay field source.

### Phase 2: Build the data and composition foundation

Deliverables:

- named datasets and query/command separation;
- view-scoped query coordinator;
- URL-backed shared query state;
- cache, deduplication, cancellation, refresh, and targeted invalidation;
- standard response profiles, including page, options, item, metric, series,
  breakdown, activity, and health;
- migration of lookup and schema reads into the shared dataset lifecycle;
- explicit endpoint operation classification and typed runtime preflight;
- separate data-tag and schema-definition invalidation;
- cross-source validation;
- lightweight catalog and lazy resolved view loading;
- host-owned widget specification registry;
- canonical widget tree walker;
- schema version and capability negotiation;
- validated contribution slots for overlays and relations.

Exit criteria:

- two widgets can consume one request without duplicate network calls;
- a command refreshes only declared affected datasets;
- lookup and schema requests no longer remain widget-owned lifecycle exceptions;
- catalog size does not scale with every complete endpoint and dashboard
  definition sent to the browser;
- unsupported cross-source references fail before rendering;
- composed views are revalidated with actionable provenance.

### Phase 3: Deliver the dashboard experience

Deliverables:

- constrained responsive stack/grid/main-side layout system;
- shared filter and time-range controls;
- `w-stat`, `w-time-series`, `w-breakdown`, `w-summary`, `w-alert`/`w-health`,
  `w-timeline`, and `w-action-form`;
- business workspace navigation and explicit routes;
- route/drawer/modal/split presentation targets;
- Commerce workspace pilot;
- visual, accessibility, and performance coverage.

Exit criteria:

- the Commerce overview uses bounded server-side metric/series profiles;
- Payments and Claims no longer rely on giant readonly forms for their primary
  operational story;
- filters and drilldowns coordinate charts and collections through shared state;
- Commerce configuration is representable with validated action forms rather
  than bespoke runtime code;
- mobile collapse and keyboard navigation are verified;
- source-oriented navigation remains available as a technical tool but is not
  required for normal Commerce tasks.

### Phase 4: Add authoring and personalization

Deliverables:

- source-first recipe builder;
- builder-facing widget registry metadata and generated documentation;
- path picker and compatibility suggestions;
- deterministic state previews and fixtures;
- draft/publish/version/diff/rollback;
- schema-drift and request diagnostics;
- saved views and controlled personalization;
- migration tooling for supported legacy definitions.

Exit criteria:

- a non-runtime contributor can create a validated collection-to-record view
  without editing renderer code;
- invalid paths, expressions, profiles, or capabilities cannot be published;
- definitions can be rolled back independently of source data;
- author diagnostics remain secret-safe.

## Commerce Pilot

Commerce is the recommended first end-to-end workspace because it exercises
the widest range of requirements.

### Overview

- order count, gross volume, active sellers, open claims, and shipment failures;
- order/revenue time series with shared range;
- orders by status and payment outcomes as breakdowns;
- alerts for failed projections, disputes, and incomplete configuration;
- drilldowns that update or navigate to filtered operational views.

### Catalogue

- Products as Table v2 with search, status, visibility, date, pagination, row
  actions, and real bulk actions;
- product record with summary, editable sections, variants, media, relations,
  and activity;
- taxonomy as a hierarchy-oriented view when that P2 widget is justified.

### Sales

- Orders collection with money/date/status formatting;
- order record with compact financial/customer summaries and transition
  timeline;
- Sellers collection and record with relation summaries.

### Protection and Payments

- operational collections for payments, refunds, claims, and disputes;
- summaries instead of repeated readonly fields;
- event timelines and explicit retry/resolve commands;
- cross-source datasets with independent failure states.

### Delivery

- shipment collection and exception queue;
- real selected-row requeue action;
- health/alert presentation for projection failures;
- timeline for shipment state changes.

### Configuration

- bounded action forms with validation, secret handling, dirty state, and
  explicit save outcomes;
- health indicators showing incomplete or invalid provider configuration.

The pilot must use bounded aggregation endpoints. It must not calculate KPIs by
downloading every product, order, payment, or shipment into the browser.

## Success Measures

### Correctness

- No accepted dashboard property is a silent runtime no-op.
- All official definitions compile after full include and contribution
  resolution.
- Unknown expressions, unsafe paths, and missing required parameters fail
  before runtime.
- Query and command endpoints cannot be used interchangeably by accident.

### User experience

- Filters, tabs, pagination, and selected records survive reload and browser
  navigation.
- Every widget distinguishes loading, refreshing, empty, error, forbidden, and
  stale states where relevant.
- Actions expose pending and outcome state and cannot double-submit.
- Record screens communicate status and recent activity without forcing users
  through long readonly forms.

### Performance

- Identical datasets in one view issue one in-flight request.
- Route changes cancel obsolete work.
- Collections remain server-paginated and bounded.
- The initial navigation catalog is independent from complete source endpoint
  payloads.
- Background refresh preserves usable content.

### Extensibility

- A new registered widget does not require unrelated manual recursive walkers.
- Overlays and relations use validated contribution slots.
- Schema and capability incompatibilities include artifact provenance.
- Official widgets have authoring documentation, state fixtures, and
  accessibility requirements.

## Evidence Map

This map anchors the investigation and should be refreshed when the relevant
contracts or official resources change.

### Public contracts

- Dashboard definitions, actions, and the five-widget union:
  [`widgets.ts`](packages/features/cms-dashboards/src/interfaces/dashboard/widgets.ts)
- Data references, filters, columns, bindings, and formats:
  [`refs.ts`](packages/features/cms-dashboards/src/interfaces/dashboard/refs.ts)
- Detail sections and field types:
  [`fields.ts`](packages/features/cms-dashboards/src/interfaces/dashboard/fields.ts)
- Minimal source shape metadata:
  [`DataShape.ts`](packages/features/cms-sources/src/interfaces/DataShape.ts)
- Relation page and dashboard projection contracts:
  [`Relation.ts`](packages/features/cms-relations/src/interfaces/Relation.ts)

### Parsing and validation

- Integration widget parser:
  [`widgets.ts`](packages/features/cms-integrations/src/core/parsing/artifacts/dashboard/widgets.ts)
- Dashboard widget validator:
  [`widgets.ts`](packages/features/cms-dashboards/src/core/validateDashboard/widgets.ts)
- Endpoint-reference validation:
  [`endpointRefs.ts`](packages/features/cms-dashboards/src/core/validateDashboard/endpointRefs.ts)
- Accepted expression roots and safe-value validation:
  [`basic.ts`](packages/features/cms-dashboards/src/core/validateDashboard/shared/basic.ts)

### Browser runtime

- Widget mount switch and current tabs construction:
  [`mount.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/mounting/mount.ts)
- Table source mapping and widget-level source states:
  [`mountSource.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/mounting/mountSource.ts)
- Runtime expression resolution:
  [`expressions.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/expressions.ts)
- Collection action context:
  [`index.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/actions/index.ts)
- Table component and selection behavior:
  [`WTable.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/widgets/w-table/WTable.ts)
- Table structure and fixed empty state:
  [`template.html`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/widgets/w-table/template.html)
- Detail data mapping:
  [`detail.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/mapping/detail.ts)
- Detail view rendering:
  [`detailView.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/widgets/w-detail/runtime/detailView.ts)
- Detail field formatting:
  [`fields.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/mapping/fields.ts)
- Selection-driven list/detail replacement:
  [`selection.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/domain/selection.ts)
- Current route and URL selection model:
  [`api.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/api.ts)

### Navigation and catalog

- Source-oriented navigation rendering:
  [`DashboardNavRendering.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/navigation/DashboardNavRendering.ts)
- Current all-in-one dashboard API response and overlay materialization:
  [`dashboards.get.ts`](packages/surfaces/cms-control/src/api/_platform/dashboards.get.ts)
- Current endpoint DTO, including upstream URL and configured headers:
  [`sourceDtoTypes.ts`](packages/features/cms-sources/src/core/overlays/sourceDtoTypes.ts)
- Dynamic overlay endpoint execution:
  [`sourceOverlayDynamicFields.ts`](packages/features/cms-sources/src/core/overlays/sourceOverlayDynamicFields.ts)
- Dynamic overlay schema cache policy:
  [`SourceOverlaySchemaCache.ts`](packages/features/cms-sources/src/core/repositories/SourceOverlaySchemaCache.ts)
- Current dashboard response handling that collapses non-success status:
  [`source.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/source.ts)
- Projected source-response size boundary:
  [`projectEndpointResponse.ts`](packages/features/cms-sources/src/core/response-projection/projectEndpointResponse.ts)

### Existing admin patterns to reuse visually

- Stats, line charts, bar lists, range controls, grids, and cards:
  [`analytics.html`](packages/surfaces/cms-control/src/static/admin/_operations/analytics.html)
- Filtered and sortable collection controls:
  [`pages.html`](packages/surfaces/cms-control/src/static/admin/_content/pages.html)
- Integration activity and created-resource patterns:
  [`detail.html`](packages/surfaces/cms-control/src/components/admin/Resources/Integrations/ui/templates/detail.html)
- Explicit running/pending command behavior:
  [`FunctionDetail.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Functions/detail/FunctionDetail.ts)
- Trigger status and inline operational controls:
  [`TriggersAdmin.ts`](packages/surfaces/cms-control/src/components/admin/Resources/Triggers/TriggersAdmin.ts)

### Representative official definitions

- Commerce Products filters and collection/detail flow:
  [`products-table.json`](packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/definitions/artifacts/dashboards/products/views/products-table.json)
- Commerce Orders money/status/detail flow:
  [`order-detail.json`](packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/definitions/artifacts/dashboards/orders/dashboard/views/order-detail.json)
- Stripe Payments cross-source workspace pressure test:
  [`dashboard.json`](packages/resources/official-integrations/integrations/extensions/commerce-stripe-payments/versions/1.0.0/definitions/artifacts/dashboards/commerce-stripe-payments-operations/dashboard.json)
- Emailer Templates filter and pagination bindings:
  [`root.json`](packages/resources/official-integrations/integrations/providers/emailer/versions/1.0.0/definitions/artifacts/dashboards/templates/dashboard/views/root.json)
- Mondial Relay selected-row operation:
  [`root.json`](packages/resources/official-integrations/integrations/providers/mondial-relay/versions/1.0.0/definitions/artifacts/dashboards/delivery/views/shipment-operations/root.json)

The inventory counts in this document are a snapshot, not a permanent
constant. Re-run the expanded-definition inventory whenever official dashboard
resources materially change.

## Open Decisions

These decisions should be resolved during Phase 0, not guessed during widget
implementation:

1. Whether public terminology should rename `DashboardDefinition` to an admin
   workspace/view contract or retain the name with clearer nested types.
2. The exact schema-version and per-widget version compatibility policy.
3. Whether query endpoints must always be GET or may include explicitly
   read-safe POST endpoints.
4. Which source semantics belong in canonical `DataShape` versus a separate
   presentation/capability schema.
5. The URL namespace for multiple independently controlled datasets in one
   view.
6. The initial responsive layout vocabulary and host breakpoints.
7. The permission model for workspace, view, dataset, contribution, and command
   scopes.
8. The persistence layer and migration behavior for saved views and user
   preferences.
9. The retention and invalidation policy for dataset cache across view routes.
10. Whether `w-alert` and `w-health` are one widget with profiles or separate
    widgets with distinct interaction semantics.

None of these decisions requires a free-form builder or executable resource
widgets. They can be settled against the Commerce pilot and the current
official definitions.
