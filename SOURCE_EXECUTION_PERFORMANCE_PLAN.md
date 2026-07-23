# CMS Source Execution Performance Plan

Status: proposed.

Date: 2026-07-23.

This document consolidates the investigation, benchmark evidence, architecture
decisions, implementation order, validation budgets, and deferred work for
source-request performance.

The scope includes:

- the Delivery and Control source proxies;
- CMS authentication, authorization, Mongo-backed source resolution, overlays,
  secrets, functions, and triggers;
- Supabase Edge Function and Data API latency;
- an internal Analytics view for aggregate endpoint performance;
- the Commerce Stripe Payments reconciliation worker;
- staging benchmarks and a possible Nano-to-Micro compute comparison.

Unless explicitly described as current behavior, the contents of this document
are proposals to approve before implementation.

## Executive Decision

The current evidence does not support treating the Supabase Free tier as the
single cause of the observed latency. Direct Edge calls usually tolerate five
concurrent requests, while the deployed CMS proxy adds material latency before
and around the upstream call.

The recommended order is:

1. instrument every request stage without changing behavior;
2. remove repeated work that can be shared only within one request;
3. remeasure before changing source-resolution contracts;
4. add small cross-request caches only where timings prove they are useful and
   their invalidation model is explicit;
5. optimize the Stripe reconciliation worker as a separate efficiency and
   risk-reduction project, not as the presumed latency fix;
6. compare Nano and Micro only after the software path is understood.

The immediate core therefore contains three workstreams:

1. request observability, aggregate endpoint reporting, and its internal
   Analytics view;
2. request-scoped subject resolution;
3. request-scoped dependency deduplication.

An explicit two-phase `prepareEndpoint` repository contract is not part of the
initial implementation. The current code already prevents privileged source
enrichment before authorization, and a new interface would be premature until
the cost of the second Mongo read is isolated.

## Goals

- Explain where CMS source-request time is spent.
- Make endpoint volume, errors, percentiles, and stage contributions visible to
  operators without requiring raw request inspection.
- Remove duplicate Mongo, role, secret, function, trigger, and identity work
  where the same result is needed several times in one request.
- Preserve authorization freshness between requests.
- Preserve the existing rule that overlays, field sources, secrets, and the
  primary upstream are not evaluated before authorization succeeds.
- Bound every cross-request cache and require coherent invalidation for any
  access- or projection-sensitive value.
- Reduce unnecessary Supabase and Stripe background work without weakening
  financial safety.
- Establish reproducible performance budgets before changing compute size.

## Non-Goals

- Skipping permission checks for public endpoints.
- Caching users, subjects, role definitions, or grants across requests.
- Caching decrypted secrets globally.
- Hard-coding one Edge Function region across every connector.
- Increasing `max_connections`, changing pool sizes, or adding indexes without
  evidence.
- Mutating an already-published integration version.
- Gating normal pull requests on public Internet latency.
- Building a general-purpose log explorer or retaining raw request traces in
  Analytics.
- Writing endpoint telemetry to Supabase or another measured upstream on every
  request.
- Treating the Stripe worker as the cause of foreground tails without a measured
  correlation.
- Replacing the existing source, overlay, function, or trigger contracts in one
  broad refactor.

## Confirmed Facts and Open Hypotheses

Confirmed by source inspection:

- one ingress request can resolve the same subject several times;
- the authorization and enriched source phases execute distinct Mongo queries;
- rejected requests already return before overlay, field-source, secret, and
  upstream work;
- the Runner preserves the ingress `Request` instance across middleware and the
  handler;
- Delivery and Control already use a request-scoped function repository;
- the Stripe worker performs recurring Data API and provider work even when
  little is repaired.

Supported by the benchmark:

- the deployed proxy adds material latency relative to direct Edge requests;
- a pinned Frankfurt direct invocation had a more stable tail in the measured
  window;
- five direct concurrent requests do not consistently saturate the Edge and
  database path;
- foreground requests overlapping the Stripe worker were not slower in the
  measured sample.

Still hypotheses:

- which CMS stage accounts for most of the proxy overhead;
- whether the second Mongo source read is expensive enough to redesign;
- whether a short source or overlay cache materially improves p95;
- whether worker activity ever contends with foreground traffic under sustained
  load;
- whether Micro materially improves the residual database tail.

## Investigation Baseline

### Benchmark method

The initial benchmark was read-only and did not modify the repository. It sent
more than 1,000 HTTP `GET` requests through:

1. the Supabase Edge Function with automatic region selection;
2. the same Edge Function pinned to `eu-central-1`;
3. the deployed CMS source proxy.

It covered:

- one repeated endpoint;
- a realistic wave containing products, brands, categories, offers, and offer
  conditions;
- concurrency one and five;
- foreground traffic both overlapping and not overlapping the Stripe
  reconciliation worker.

The scripts and raw data remain under `/tmp`. They contain environment-specific
information and are not repository artifacts.

### Edge and proxy observations

The following values describe one environment and one measurement window. They
are a baseline, not permanent service guarantees.

| Path | Concurrency 1 p50 | Concurrency 5 p50 | Concurrency 5 p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Edge, automatic region, mixed endpoints | 171 ms | 176 ms | 803 ms | 958 ms |
| Edge, pinned Frankfurt, mixed endpoints | 177 ms | 185 ms | 253 ms | 284 ms |
| Deployed proxy, mixed endpoints, per request | 286 ms | 459 ms | 868 ms | 1,029 ms |
| Deployed proxy, repeated endpoint | 597 ms | 705 ms | 853 ms | 1,193 ms |

For the deployed mixed wave at concurrency five:

- wave-completion p50 was approximately 843 ms;
- wave-completion p95 was approximately 1,030 ms.

Per-path proxy medians increased under concurrency:

| Endpoint | Concurrency 1 p50 | Concurrency 5 p50 |
| --- | ---: | ---: |
| Products | 531 ms | 687 ms |
| Brands | 251 ms | 401 ms |
| Categories | 249 ms | 411 ms |
| Offers | 637 ms | 842 ms |
| Offer conditions | 236 ms | 416 ms |

A server-side direct Supabase smoke request for products took approximately
385 ms, compared with approximately 597 ms through the deployed proxy. The
production server's automatic Edge invocation was already observed in
`eu-central-1`, so a global region pin is not an immediate production fix.

### Interpretation

- Direct Edge execution is not consistently saturated by five concurrent
  requests, although automatic routing showed a rare tail stall.
- Pinning Frankfurt made the measured direct Edge tail much more stable.
- The deployed proxy adds a material and concurrency-sensitive cost.
- Nano compute can amplify tails, but the benchmark does not prove that
  hardware is the primary bottleneck.
- A compute change would not remove Mongo, CMS authorization, source
  enrichment, or proxy overhead.

## Current Request Path

### Repeated subject resolution

`LocalAuthentication.getSubject()` validates the presented PAT or session and
then resolves the current user and role. Its contract intentionally rereads the
role so role changes become visible without a new login.

The same incoming request can currently resolve that subject repeatedly:

- once in the Control authentication guard;
- again for source authorization;
- again for computed source context;
- again for trigger user context;
- again for system-function execution.

Control can therefore reach five subject resolutions on a rich path. Delivery
can reach four across authorization, context, triggers, and functions.

The Runner passes the same `Request` instance from middleware to the route
handler. Its middleware `next()` contract cannot substitute another request.
Trigger body clones are used only for body reads, and synthetic function
requests receive user context explicitly.

### Source resolution and authorization

[`handleSourceRequest`](packages/features/cms-sources/src/http/handleSourceRequest.ts)
currently performs:

1. a safe endpoint lookup for authorization;
2. authorization;
3. an enriched endpoint lookup;
4. a descriptor consistency check;
5. trigger interception and endpoint execution.

The security ordering is already correct:

- a rejected request returns before the enriched lookup;
- `SourceOverlaySourceRepository.getEndpointForAuthorization()` delegates to
  the underlying endpoint descriptor without loading overlays;
- field-source materialization occurs only in the enriched lookup;
- secret resolution occurs later in `executeEndpoint`;
- `sameAuthorizationDescriptor()` returns `409` when method or access metadata
  changes between the two reads.

This invariant must be preserved and covered by explicit call-count tests.

### The two Mongo reads do not currently share one cache key

The production composition is:

```text
FunctionAwareSourceRepository             # added for each proxy request
`-- SourceOverlaySourceRepository          # currently long-lived
    `-- CompositeSourceRepository
        `-- ValidatingSourceRepository
            `-- MongoSourceRepository
```

For a user source, the two phases follow different calls:

```text
Authorization
Overlay.getEndpointForAuthorization
-> Composite.getEndpoint
-> Mongo.getEndpoint
-> findOne({ "endpoints.urn": urn })

After authorization
Overlay.getEndpoint
-> Composite.getSource
-> Mongo.getSource
-> findOne({ _id: sourceUrn })
-> getOverlaysForSource(sourceId)
```

A request-scoped decorator that merely memoizes `getEndpoint(urn)` and
`getSource(sourceUrn)` still performs both Mongo reads. Removing this duplicate
requires canonicalizing both paths to one source aggregate below the overlay,
or introducing an explicit two-phase resolution contract.

### Existing reusable pattern

`RequestScopedFunctionRepository` already:

- is constructed once for each source-proxy request;
- stores in-flight promises;
- shares repeated function reads;
- removes failed promises;
- returns defensive clones;
- invalidates its local entry after a write.

The new request-scoped work should reuse this pattern instead of introducing a
large generic cache framework first.

## Design Principles

1. **Authorization precedes privileged enrichment.** No rejected request may
   load overlays, field-source data, secrets, or the primary upstream.
2. **One request sees one subject snapshot.** A role change is visible to the
   next request, not halfway through the current one.
3. **Authorization data is not globally stale.** Users, subjects, role
   definitions, and grants are request-scoped only.
4. **Single-flight is bounded by scope.** Concurrent reads of the same key
   share one promise; a rejected promise is evicted.
5. **Cross-request caches are typed, bounded, and coherent.** They use
   defensive copies, capacity limits, short TTLs, write invalidation, and a
   reviewed multi-instance policy.
6. **Plaintext secrets are request-local.** A later shared cache may contain
   only encrypted secret documents.
7. **Surface packages remain adapter-free.** Mongo implementations stay in
   feature adapters and composition roots.
8. **Counters precede latency claims.** CI proves deterministic call budgets;
   staging measures network latency.
9. **Metrics and traces have different sampling rules.** Aggregate counters and
   histograms remain representative; forced slow or error diagnostics never
   bias published percentiles.
10. **The observer stays off the critical path.** Endpoint metrics use bounded
    in-memory aggregation and asynchronous batch persistence.
11. **Financial safety remains fail-closed.** Worker efficiency must not weaken
   payment or transfer guards.
12. **Published resources remain immutable.** Connector changes use a new
    integration release and append-only migration when required.

## Phase 0: Isolated Baseline

Implementation must use an isolated Git worktree because the current workspace
contains unrelated changes, including source-proxy work.

Before changing code:

1. install frozen dependencies when the worktree is new;
2. run `bun run check:all`;
3. retain the current benchmark scripts and raw results outside Git;
4. record the exact commit, environment, integration versions, dataset, region,
   worker state, and request matrix;
5. capture initial deterministic repository-call counts.

Every implementation PR repeats `bun run check:all` before handoff. TypeScript
changes also run `bun run format`, followed by a diff review.

## Phase 1: Request Observability

### Correlation

Create or validate an opaque request correlation ID at CMS ingress:

- accept an incoming value only when it matches the selected strict format;
- otherwise generate a new value;
- return it on success and error responses;
- include it in CMS and Edge structured logs;
- never derive it from a user ID, email, secret name, resource ID, or business
  parameter.

Propagation to Edge is explicit rather than assumed:

- strip an untrusted inbound `x-cms-correlation-id`;
- inject the validated or generated value after user-configurable source
  headers have been resolved;
- forward it only to trusted connector targets through the internal header
  policy;
- verify at the Edge entrypoint that the value has the expected opaque format;
- test that source definitions and callers cannot override it.

Synthetic trigger and function requests must not accidentally inherit an
unrelated authenticated subject. Their existing explicit user-context
propagation remains authoritative.

### Timing collector

Add a generic request-timing collector to `@bernouy/http-runner` and inject it
through feature contracts. `cms-sources` records stages but does not choose a
production logger.

Stable CMS timing names:

```text
cms_auth
cms_endpoint_auth_lookup
cms_authorize
cms_roles
cms_endpoint_resolve
cms_source
cms_overlays
cms_context
cms_secret
cms_headers
cms_body
cms_upstream
cms_projection
cms_identity_binding
cms_total
```

Stable Edge timing names:

```text
edge_route
edge_db_wall
edge_db_sum
edge_db_calls
edge_provider
edge_projection
edge_total
```

`edge_db_sum` is the sum of individual database-call durations.
`edge_db_wall` is the elapsed critical path and may be smaller when calls run in
parallel.

Instrumentation belongs in central wrappers, especially the Edge PostgREST
helper, rather than being repeated in every Commerce route.

### Exposure and sampling

- Aggregate counters and fixed timing histograms: collect 100% in every
  environment. They are updated in memory and contain no raw request records.
- Detailed benchmark and staging traces: collect 100%.
- Detailed production traces and structured timing logs: start with
  configurable uniform 1% sampling.
- Production errors, timeouts, and requests above 1,000 ms: retain detailed
  diagnostics at 100% in a separate forced cohort.
- Never merge the forced cohort into percentile or error-rate calculations. It
  deliberately over-represents slow and failed requests.
- Delivery `Server-Timing`: disabled by default and available only for
  authorized diagnostics.
- Do not emit `Timing-Allow-Origin: *`.
- Do not expose cache hits, secret names, URNs, user IDs, or internal SQL names
  in public timing headers.

Instrumentation overhead must stay below 5 ms at p95 and below 2% of total
request time.

### Supabase observability

For benchmark windows, collect:

- Edge logs by function and correlation ID;
- Data API request durations and status;
- Database Reports for CPU, memory, I/O, and connections;
- `pg_stat_statements` snapshots and deltas by `queryid`;
- `pg_stat_activity`, lock, and `PGRST003` evidence.

Do not call `pg_stat_statements_reset()` on a shared project.

`PGRST003` means that PostgREST timed out while waiting for a connection from
its internal pool. It is evidence of a complete acquisition timeout, not a
direct measurement of every shorter pool wait. To detect shorter contention,
compare Edge database wall time with SQL execution time and concurrent
connection metrics.

Automation created after 2026-07-23 must use the current Supabase Management
API `logs` endpoint. The legacy `logs.all` endpoint is scheduled for removal on
2026-09-23.

## Phase 1b: Endpoint Performance Analytics

The request-timing collector must have a durable operator-facing outcome before
optimization work begins. Add a host-owned `Analytics > Endpoint performance`
view at `/admin/analytics/endpoints`.

This is not a declarative `cms-dashboards` resource. Integration dashboards are
installed and versioned with integration resources, while endpoint
observability is a host capability that must remain available when an
integration or upstream is unhealthy.

The existing `Request health` view remains focused on Delivery page quality.
The new view covers source endpoint execution through both Delivery and
Control.

### Contract and package boundary

Keep the implementation in `@bernouy/cms-analytics`, but do not add endpoint
observations to the visitor-oriented `AnalyticsEvent` or `AnalyticsStore`.
Those contracts apply collection policy, privacy publication thresholds,
visitor estimation, and long-lived content reporting that do not belong to
operator telemetry.

Introduce separate contracts with responsibilities equivalent to:

```ts
type EndpointPerformanceObservation = {
    ts: Date;
    surface: "control" | "delivery";
    endpointUrn: string | "__unresolved__";
    method: string;
    status: number;
    stagesMs: Partial<Record<EndpointTimingStage, number>>;
};

interface EndpointPerformanceRecorder {
    observe(observation: EndpointPerformanceObservation): void;
}

interface EndpointPerformanceReports {
    dashboard(query: EndpointPerformanceQuery): Promise<EndpointPerformanceDashboard>;
}
```

The recorder is synchronous only as an in-memory update. It must not expose a
promise that callers are expected to await before returning the source
response. Mongo implementations remain behind the package's explicit adapter
subpath and are selected by the runtime composition root.

### Bounded dimensions and privacy

Durable rollups may contain only bounded operational dimensions:

- the logical source endpoint URN, or one fixed unresolved sentinel;
- `control` or `delivery`;
- the normalized HTTP method;
- response status class and outcome;
- stable timing-stage names;
- aggregate counts, sums, maxima, and fixed histogram buckets.

They must never contain:

- a raw request or upstream URL;
- path parameters or query strings;
- headers, cookies, IP addresses, user agents, or visitor hashes;
- user, subject, role, session, or secret identifiers;
- request or response bodies;
- raw error messages, stack traces, or provider payloads;
- correlation IDs.

Correlation IDs remain short-lived diagnostic log keys. They are intentionally
not a dashboard dimension because their cardinality is unbounded.

The recorder validates dimensions before accepting an observation. Unknown
methods, stages, outcomes, oversized URNs, and non-finite durations are rejected
or normalized to fixed sentinels. This prevents accidental high-cardinality
growth and unsafe data retention.

### Aggregation and persistence

Use a separate Mongo collection such as
`analytics_source_performance_rollups`. Do not write operational telemetry to
Supabase:

- the measurements span CMS, Mongo, and non-Supabase endpoints;
- the dashboard must still explain requests when Supabase is slow or
  unavailable;
- writing to the measured dependency would create an observer feedback loop.

Every completed source request updates a bounded in-memory aggregate keyed by
time bucket and the approved dimensions. Fixed mergeable histograms are
required for `p50`, `p95`, and `p99`; averages and maxima alone are
insufficient.

The runtime flushes aggregates to Mongo in batches every five to ten seconds
with atomic counter increments. Foreground requests never wait for a flush.
Concurrent CMS instances merge into the same rollups. A crash may lose at most
the current short buffer; metrics loss is preferable to delaying or failing a
business request. Flush failures and dropped observations have their own
bounded process counters and structured warnings.

The initial retention policy is:

- five-minute buckets;
- fourteen days of endpoint performance history;
- dashboard ranges of one hour, twenty-four hours, and seven days.

Add hourly compaction and a thirty-day range only after operators demonstrate
the need. Retention is enforced by TTL, and stopping collection must not require
deleting existing rollups.

### Metrics versus diagnostic traces

All accepted endpoint requests contribute to aggregate counts, status rates,
total-latency histograms, and stage histograms. This path performs only bounded
memory updates.

Detailed per-request timing logs remain governed by the sampling policy from
Phase 1:

- a uniform cohort for representative investigation;
- a forced cohort for errors, timeouts, and requests above 1,000 ms.

Dashboard percentiles and rates are computed only from the complete aggregate
rollups. The forced diagnostic cohort stays separate in structured logs and can
never be used as the source of a percentile. The UI displays observation
coverage, freshness, and dropped-observation counts so incomplete data is
visible.

### Dashboard MVP

The first view contains:

- headline cards for request count, error rate, `p50`, `p95`, and `p99`;
- a timeline for volume, `p95`, and error rate;
- a sortable endpoint table with surface, method, calls, percentiles, maximum,
  and error rate;
- filters for range, surface, source endpoint, method, and status class;
- one endpoint detail showing status distribution, latency histogram, and the
  contribution of authorization, source resolution, overlays, context,
  secrets, upstream execution, and projection;
- explicit empty, stale, partial, loading, and unavailable states;
- a visible statement that the view contains aggregates and no individual
  request logs.

Expose one aggregate admin endpoint initially:

```text
GET /api/analytics/endpoints?range=24h&surface=delivery&endpoint=...
```

It returns the complete dashboard projection in one guarded request. The route
is mounted behind the existing Control authentication guard and is never
available from public Delivery. The API enforces allowlisted ranges, filters,
sort keys, and result limits.

Reuse the current Analytics shell, navigation, range controls, cards, loading
states, and visual language. Keep endpoint-specific fetching, rendering, and
tests in dedicated files rather than further growing the existing central
Analytics modules.

### Supabase and Edge detail

The CMS can always measure `cms_upstream`, which includes the complete
connector call. It cannot infer the internal split between Edge routing,
PostgREST pool wait, SQL execution, and provider work.

The first dashboard therefore remains useful with `cms_upstream` alone.
Additional `edge_*` stages appear only when a trusted connector returns
allowlisted internal timing metadata or when a secure correlation pipeline can
join aggregate Edge observations.

Any response metadata path must:

- be accepted only from trusted connector targets;
- allow only the stable `edge_*` names defined in Phase 1;
- parse bounded finite numeric values and reject duplicates or oversized
  headers;
- remain unavailable to arbitrary caller- or integration-defined headers;
- avoid exposing SQL names, pool internals, secrets, or provider identifiers to
  public clients.

Edge Functions must not insert one telemetry row into Supabase or Mongo for
every business request. Central wrappers may contribute timings to the trusted
response metadata and structured sampled logs.

The Analytics view complements rather than replaces Supabase Database Reports,
Edge logs, `pg_stat_statements`, and connection diagnostics used during a
benchmark window.

### Acceptance criteria

- Controlled traffic produces exact aggregate request and status counts.
- Fixed-histogram percentile calculations pass deterministic boundary tests.
- Forced slow and error diagnostics cannot change aggregate percentiles.
- Concurrent runtime instances merge counters without overwriting one another.
- A Mongo outage, full metrics buffer, or failed flush never changes the
  business response.
- No source request waits for telemetry persistence.
- The recorder enforces the dimension allowlist and forbidden-data tests.
- The admin API rejects unauthenticated access and invalid filters.
- The dashboard handles zero data, partial data, stale data, and backend
  unavailability.
- Staging dashboard counts reconcile with the benchmark request count, and its
  percentile buckets contain the benchmark percentiles within expected bucket
  precision.
- The combined timing and aggregation overhead remains below 5 ms at p95 and
  below 2% of total request time.

## Phase 2: Request-Scoped Subject Resolution

Add a single-flight helper in `cms-auth` backed by:

```ts
WeakMap<Request, WeakMap<Authentication, Promise<Subject | null>>>
```

This is the least invasive bridge between the authentication middleware and
the downstream handler because the Runner guarantees the same ingress
`Request` object through that chain.

Required semantics:

- concurrent calls for the same request and authentication backend share one
  lookup;
- `null` is memoized for that request;
- a rejected promise is removed;
- the canonical result cannot be mutated by a caller;
- a new request always performs a new lookup;
- synthetic internal requests do not inherit an ingress subject implicitly.

The helper replaces direct repeated calls in:

- the authentication guard;
- Control source authorization and context;
- Delivery source authorization and context;
- trigger user resolution;
- system-function user resolution.

This change preserves the `Authentication` contract: repeated calls for the
same request already must be side-effect free and yield the same result.

## Phase 3: Request-Scoped Dependency Deduplication

Create one explicit source execution scope inside each proxy handler. It reuses
the same promise-memoization behavior as the existing request-scoped function
repository.

The scope may contain:

- source and endpoint reads that are genuinely identical;
- source overlays by source ID;
- role definitions for repeated checks in that request;
- secret plaintext by normalized reference, only for that request;
- computed source context;
- function reads;
- trigger lookup results;
- identity resolutions.

The subject remains bridged through the `WeakMap` helper because the
authentication guard executes before the handler creates its explicit scope.
This is one request-lifetime model with two narrowly appropriate mechanisms,
not a global cache.

### Expected call budgets

For one request:

- subject resolution: at most one;
- each identical source read: at most one;
- overlays for one source: at most one;
- each secret reference: at most one;
- computed context: at most one;
- each function definition: at most one;
- each trigger lookup: at most one.

Role definitions remain request-scoped. This primarily benefits paths that
perform several permission checks, such as page-source preflight with multiple
bindings. A normal Delivery proxy request currently performs only one
`roles.list()` after its access-mode check, while Control normally
short-circuits as `admin`.

### Security tests

Tests must prove:

- four concurrent subject resolutions for one request produce one store read;
- a second request rereads the subject and current role;
- a role assignment or grant change is visible on the next request;
- a rejected lookup is not retained;
- a missing subject is retained only within its request;
- a denied source request performs zero overlay, field-source, secret,
  interceptor, and upstream calls;
- no synthetic function request inherits an ingress identity;
- five concurrent reads of the same dependency produce one load;
- returned mutable definitions are defensively cloned;
- existing `401`, `403`, `404`, `405`, `409`, and `500` behavior remains
  unchanged.

## Phase 4: Measured Source-Read Decision

Do not add `prepareEndpoint` in the initial request-scope work.

Instrumentation and repository counters must first isolate:

- the authorization endpoint query;
- the full source query;
- overlay lookup and materialization;
- the share of total non-upstream proxy time attributable to each.

Treat the duplicate base read as material when removing it is expected to save
at least 20 ms at p95 or at least 10% of measured CMS non-upstream time. If it
is below both thresholds, keep the current simpler contract.

### Preferred no-interface option

If material, first evaluate a request-scoped composition below the overlay:

```text
FunctionAwareSourceRepository
`-- SourceOverlaySourceRepository
    |-- RequestScopedSourceRepository
    |   `-- Composite -> Validating -> Mongo
    `-- RequestScopedSourceOverlayRepository
        `-- MongoSourceOverlayRepository
```

`RequestScopedSourceRepository.getEndpoint(urn)` canonicalizes user endpoint
lookups through the cached source aggregate:

```ts
const source = await getSource(sourceUrnOf(urn));
return source?.endpoints.find((endpoint) => endpoint.urn === urn) ?? null;
```

This produces:

1. one base source snapshot for authorization;
2. no overlay or field-source work before authorization;
3. reuse of the same source snapshot during enrichment;
4. one overlay lookup after authorization.

Control can construct this chain inside its request handler. Delivery currently
receives a long-lived overlay repository from the production runtime, so it
would need a backward-compatible request-source factory or equivalent
composition-root hook. Trigger interception must receive the same request
scope; the current interceptor captures long-lived repositories before the
handler callback.

### When `prepareEndpoint` becomes justified

Reconsider a two-phase contract only if:

- request-local composition is materially more complex than an explicit
  prepare/authorize/resolve abstraction;
- future enrichment decorators need to share private pre-authorization state;
- several repository implementations cannot canonicalize endpoint lookup
  through a source aggregate;
- measurements show a significant benefit that the smaller design cannot
  deliver.

Keep `sameAuthorizationDescriptor()` as defense in depth even when production
uses a shared request snapshot.

## Phase 5: Conditional Cross-Request Caches

Add these only after request-scoped changes have been deployed and measured.

No shared source, overlay, or secret cache is enabled in the initial rollout.
Candidate values for a later explicitly coherent deployment are:

| Data | Initial state | Candidate capacity | Candidate TTL | Shared form |
| --- | --- | ---: | ---: | --- |
| Source aggregates | Disabled | 128 | 2 s | Defensive clone |
| Overlays by source | Disabled | 256 | 10 s | Defensive clone |
| Encrypted secret documents | Disabled | 128 | 5 s | Ciphertext only |
| Subjects and users | Disabled permanently | 0 | None | Request-scoped only |
| Role definitions and grants | Disabled permanently | 0 | None | Request-scoped only |

A source aggregate contains endpoint `access` and `method`. A stale shared source
entry can therefore delay an authorization revocation even when role
definitions are fresh. An overlay can affect accepted and projected data
shapes. TTL alone is not an acceptable coherence mechanism for either in a
multi-instance runtime.

Enable a candidate cache only when one of these conditions is explicit and
tested:

- the runtime is guaranteed to have one process and every write uses the same
  invalidating repository instance; or
- distributed invalidation, a Mongo change stream, or equivalent versioned
  coherence is active before the cached value can authorize or project another
  request.

Required behavior:

- promise single-flight;
- bounded LRU eviction;
- no negative caching initially;
- failed-promise eviction;
- defensive copies;
- immediate local invalidation after writes;
- runtime flags for enablement, capacity, and TTL.

Local invalidation covers:

- `createSource`, `updateSource`, and `deleteSource`;
- `upsertOverlay` and `deleteOverlay`;
- `secrets.set` and `secrets.delete`.

The existing `SourceOverlaySchemaCache` remains authoritative for materialized
dynamic schemas and must not be duplicated.

`SecretStore.get()` already returns plaintext. A ciphertext cache must therefore
live inside `EncryptedMongoSecretStore`, around the Mongo document lookup and
before decryption. A generic `SecretStore` decorator would cache plaintext and
is forbidden. Secret rotation and multi-instance invalidation must be tested
before enabling even this internal cache.

## Separate Workstream: Stripe Reconciliation Efficiency

### Current evidence

The scheduled trigger declares a 15-second interval, but completion schedules
the next occurrence relative to the previous finish. With a median run near
2,962 ms and scheduler polling, observed starts were approximately 19.1 seconds
apart rather than aligned to fixed 15-second wall-clock ticks.

In the original 50-run sample, a typical run:

- lasted approximately 2,956 ms;
- made approximately 21 PostgREST calls;
- scanned two records;
- repaired none;
- reported no exception.

Over a longer 24-hour observation:

- 1,124 runs completed;
- 2,246 objects were scanned;
- 44 repairs occurred;
- one exception occurred.

The worker therefore creates real churn. However, the foreground benchmark did
not show a latency penalty while it was running:

| Foreground sample | Count | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Overlapping a worker run | 23 | 752 ms | 862 ms |
| Outside a worker run | 127 | 843 ms | 1,029 ms |

The worker remains worth improving for cost, noise, connection demand, and
future scalability. It is not currently proven to cause the foreground tails.

Correlation must use actual run `started_at` and `finished_at` intervals, not a
`timestamp modulo 15 seconds` approximation.

### Target responsibility split

#### Fast recovery drain

Run after a short interval and process only:

- pending Stripe webhook events;
- interrupted financial operations;
- pending Commerce projections.

Use an atomic service-only claim RPC with:

- `FOR UPDATE SKIP LOCKED`;
- explicit owner and claim token;
- expired-lease recovery;
- strict total batch limit;
- fairness between non-empty queues;
- stable idempotency keys.

The idle target is:

- no Stripe API call;
- no `reconciliation_runs` row;
- no mutation when nothing is due;
- at most two PostgREST calls;
- less than 300 ms.

#### Due provider-truth reconciliation

Reconcile only records whose next check is due. Add either a task table or
equivalent durable fields:

```text
next_reconciliation_at
reconciliation_claim_owner
reconciliation_claimed_at
reconciliation_attempt_count
```

Initial policy:

- `created`, `requires_action`, and `processing`: first recheck after about 60
  seconds;
- `succeeded` but not terminally projected or settled: recheck after about five
  minutes;
- terminal records: excluded unless an explicit recovery task exists;
- transient failure: bounded exponential backoff;
- unresolved ambiguity: manual review, not silent infinite retry.

Use a partial index for due non-terminal work only after validating the
representative claim plan.

#### Platform payout-control audit

Start with a 60-second audit and an immediate check after a liability-revision
change.

Persist a snapshot hash and checked time. Write provider exceptions only on:

- healthy to drift;
- changed drift details;
- drift to resolved.

The periodic audit is for drift detection and alerting. It must not replace the
existing fail-closed guard before a protected payment or relevant transfer.

### SQL and API security

Worker RPCs must:

- use `SECURITY INVOKER` unless a reviewed requirement proves otherwise;
- set `search_path = ''`;
- revoke execution from `PUBLIC`, `anon`, and `authenticated`;
- grant only the required service role;
- remain behind `access.mode = "system"` endpoints;
- keep service-role credentials out of public clients;
- preserve RLS as defense in depth where applicable.

### Financial invariants

The refactor must preserve:

- at-least-once processing with idempotent provider actions;
- no fabricated provider success;
- claim token and lease validation;
- projection causality, ordering, acknowledgement, and failure handling;
- strict batch limits and queue fairness;
- manual review for ambiguous money movement;
- monotonic payout-protection requirements;
- refund, reversal, transfer, and seller-recovery arithmetic constraints;
- fail-closed drift behavior for new protected payments and transfers.

### Versioning and migration

If `1.0.0` has already been published, do not edit it in place. Introduce a new
release, likely `1.1.0` because the change adds schema and worker behavior, with
append-only migration assets.

Roll out with:

1. expand-only nullable fields, indexes, and RPCs compatible with the old
   worker;
2. Edge code accepting old and new paths;
3. shadow eligibility comparison without claims or mutation;
4. activation of the fast drain;
5. the old worker slowed to a safety-net cadence for 24 to 48 hours;
6. activation of the due-provider and payout-audit sweeps;
7. removal of the old path only after queue age, lease recovery, projections,
   and latency are validated.

If `1.0.0` is demonstrably unpublished, the release decision may be revisited,
but migration and fresh-install equivalence remain required.

## Postgres and Data API Diagnostics

Before changing schema or connections:

1. capture `pg_stat_statements` deltas without resetting shared statistics;
2. run `EXPLAIN (ANALYZE, BUFFERS)` only for representative safe queries in a
   controlled environment;
3. inspect connection usage, PostgREST pool timeouts, locks, CPU, memory, and
   I/O;
4. compare Data API wall time with database execution time.

Do not:

- increase `max_connections` blindly;
- treat a larger pool as the first fix;
- remove apparently unused indexes from a young workload;
- add retry loops that amplify Data API demand;
- add an index without a query or foreign-key maintenance reason.

Two foreign-key indexes are separate hygiene candidates after verification:

- `commerce.notification_deliveries(rule_key)`;
- `commerce.notification_user_preferences(rule_key)`.

They belong in their own migration and must not be presented as the general
latency fix.

## Edge Region Policy

Do not hard-code Frankfurt globally.

The pinned direct benchmark was more stable, but production automatic routing
was already observed in `eu-central-1`. If instrumentation later shows incorrect
or unstable placement:

- represent region as connector/runtime configuration;
- default to automatic routing;
- permit an explicit database-region policy where justified;
- document the failover trade-off;
- test header allowlists and secret isolation.

## Nano-to-Micro Evaluation

Compute is evaluated only after request-scoped optimization and instrumentation.
The test must distinguish database time from CMS, Mongo, network, and Edge
runtime time.

### Protocol

1. Freeze commit, data, Edge versions, region policy, and worker configuration.
2. Run a five-minute warmup.
3. Apply 20 to 30 minutes of read-only sustained load at a fixed arrival rate,
   rather than waiting for each response before scheduling the next request.
4. Measure the beginning, middle, and end of the plateau separately.
5. Collect CPU, memory, I/O, PostgREST connections, `PGRST003`, p50, p95, and
   p99.
6. Segment foreground results by real worker-run intervals.
7. Repeat three times on Nano.
8. Change compute only during an approved maintenance window.
9. Warm the new compute and repeat the identical matrix three times.

Small Supabase compute instances have burst capacity. Short request waves alone
can therefore miss sustained baseline constraints.

### Decision

Micro is justified for performance when at least two of three runs show one of:

- Edge or database p95 improves by at least 25%;
- p99 improves by at least 40%;
- sustained CPU or I/O tails disappear with a corresponding latency
  improvement.

Micro is not justified by this workload when:

- p50 and p95 improve by less than 10%; and
- more than half of the latency remains outside the database path.

An improvement between 10% and 25% is inconclusive and requires another
measurement window.

Compute changes require separate approval because they affect cost and may
require downtime.

## Reproducible Benchmark

Do not commit the current `/tmp` scripts or raw output.

If a durable manual runner is approved later, use:

```text
quality/performance/source-proxy/
|-- runner.ts
|-- workloads.ts
|-- thresholds.json
`-- README.md
```

Version only:

- workload definitions;
- result schema;
- non-secret thresholds;
- runner implementation.

Keep out of Git:

- credentials;
- private environment URLs;
- raw provider or database logs;
- business data;
- result files containing environment-specific values.

### Workload matrix

Paths:

1. Edge, automatic region;
2. Edge, explicitly selected database region;
3. deployed CMS proxy.

Profiles:

- repeated products endpoint;
- realistic products, brands, categories, offers, and offer-conditions wave.

Concurrency:

- 1;
- 5;
- 10.

Per matrix cell:

- 20 unmeasured warmups;
- 50 measured waves;
- three independent repetitions;
- randomized cell order;
- constant keep-alive behavior;
- fixed data and parameters;
- TTFB, total time, status, response size, correlation ID, and timing stages.

Run both:

- realistic background workers;
- an approved quiet staging control, with all schedules restored and verified
  afterward.

## Performance Budgets

### Initial non-regression budgets

- Direct Frankfurt Edge read: p50 at most 220 ms and p95 at most 350 ms.
- Error rate below 0.1%.
- Zero timeout and zero `PGRST003`.
- Proxy realistic wave at concurrency five: completion p50 at most 900 ms and
  p95 at most 1,200 ms.
- Heavy products and offers proxy requests: p50 at most 750 ms and p95 at most
  1,050 ms.

These initial values protect the measured baseline; they are not the final
optimization targets.

### Optimization targets

- CMS non-upstream overhead: p50 at most 100 ms and p95 at most 250 ms.
- Direct Edge p95 at most 350 ms.
- Realistic concurrency-five wave p95 at most 800 ms.
- `p50(c5) / p50(c1)` at most 1.25.
- `p95(c5) / p95(c1)` at most 1.5.
- No request above 1.5 seconds in a normal 50-wave run.
- Idle Stripe recovery: at most two PostgREST calls, no Stripe request, no
  write, and less than 300 ms.

## CI and Staging Policy

### Pull-request CI

Use deterministic tests for:

- exact repository-call budgets;
- single-flight behavior;
- cache invalidation;
- failed-promise eviction;
- authorization ordering;
- correlation-ID validation and propagation;
- timing header format and redaction;
- endpoint-metric dimension validation and cardinality bounds;
- histogram boundaries and percentile calculation;
- complete-aggregate versus forced-diagnostic cohort separation;
- asynchronous batch flush, multi-instance merge, and failure isolation;
- endpoint-performance admin authorization and query validation;
- financial worker claim, lease, fairness, idempotency, and no-work behavior.

Do not fail a pull request based on public network latency.

### Staging

Run the remote benchmark manually at first. If it becomes sufficiently stable,
add a nightly staging job that:

- uploads JSON or CSV results as CI artifacts;
- reconciles request counts with the endpoint performance rollups;
- compares p95 with a seven-run moving median;
- warns on a regression above 15%;
- blocks a release only after three consecutive runs above budget.

Before a sensitive release, run both realistic and approved quiet controls
against the same commit and dataset.

## Implementation Sequence

Keep changes small and independently measurable:

1. **Observability primitives:** correlation, timing collector, Edge
   database-call instrumentation, and deterministic timing tests.
2. **Endpoint metric backend:** bounded in-memory aggregation, Mongo rollups,
   report projection, guarded admin API, and failure-isolation tests.
3. **Endpoint performance view:** Analytics navigation, cards, timeline,
   endpoint table, filters, detail, and UI state tests.
4. **Subject scope:** one subject resolution across guard, authorization,
   context, triggers, and functions.
5. **Dependency scope:** context, secret, overlay, function, trigger, identity,
   and identical source-read single-flight.
6. **Measured source decision:** keep the current two reads, add canonical
   below-overlay request composition, or introduce a two-phase contract.
7. **Conditional shared caches:** coherently invalidated sources, overlays, and
   encrypted secret documents only.
8. **Stripe efficiency:** expand-only migration, shadow comparison, worker
   split, and gradual cutover.
9. **Database hygiene:** independently justified indexes only.
10. **Compute experiment:** sustained Nano-to-Micro comparison after software
   changes.

Do not combine these into one large pull request.

## Rollback

- Observability and public timing exposure must be configuration-controlled.
- Endpoint metric recording, flushing, and reporting must have an emergency
  disable flag and fail open for business requests.
- Disabling endpoint metrics stops new observations without deleting existing
  TTL-managed rollups.
- Request-scoped deduplication can be reverted without persistence changes.
- Shared caches must have an emergency disable flag.
- Region selection must fall back to automatic routing.
- Stripe rollout keeps the previous worker at a reduced safety-net cadence
  until the new paths are proven.
- Expand-only database changes remain compatible during rollback.
- No rollback may delete financial audit, exception, lease, or projection
  state.

Rollback immediately when a change:

- alters response bodies or status codes unexpectedly;
- exposes a secret or internal identifier;
- retains a forbidden or unbounded endpoint-performance dimension;
- weakens authorization freshness;
- performs privileged enrichment before authorization;
- adds more than 5 ms instrumentation overhead at p95;
- violates queue, lease, idempotency, or financial invariants.

## Evidence Map

| Evidence | Source |
| --- | --- |
| Two source-resolution phases | `packages/features/cms-sources/src/http/handleSourceRequest.ts` |
| Safe overlay authorization lookup | `packages/features/cms-sources/src/core/overlays/sourceOverlay.ts` |
| Distinct Mongo source and endpoint queries | `packages/features/cms-sources/src/default-implementation/MongoSourceRepository.ts` |
| Production source composition | `packages/runtimes/cms-server/src/runtime/stores/features.ts` |
| Delivery subject and role authorization | `packages/surfaces/cms-delivery/src/core/sources/authorization.ts` |
| Delivery source-proxy composition | `packages/surfaces/cms-delivery/src/core/sources/registerSourceProxy.ts` |
| Control repeated subject resolution | `packages/surfaces/cms-control/src/core/admin/control/sourceProxy.ts` |
| Runner preserves the request instance | `packages/foundation/http-runner/src/core/requestDispatch.ts` |
| Local auth rereads current roles | `packages/features/cms-auth/src/default-implementation/authentication/LocalAuthentication.ts` |
| Existing function single-flight pattern | `packages/features/cms-functions/src/default-implementation/RequestScopedFunctionRepository.ts` |
| Existing visitor-oriented analytics contract | `packages/features/cms-analytics/src/interfaces/AnalyticsStore.ts` |
| Existing Analytics request-health view | `packages/surfaces/cms-control/src/components/admin/Layout/Analytics/templates/health.html` |
| Existing Analytics navigation | `packages/surfaces/cms-control/src/components/admin/Layout/Analytics/nav.html` |
| Stripe reconciliation loop | `packages/resources/official-integrations/integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/functions/cms-stripe-connect/workflows/reconciliation/run.ts` |
| Stripe payout-protection guard | `packages/resources/official-integrations/integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/functions/cms-stripe-connect/workflows/payments/creation/platform-protection.ts` |
| Reconciliation schedule | `packages/resources/official-integrations/integrations/extensions/commerce-stripe-payments/versions/1.0.0/definitions/artifacts/triggers/schedules/reconcile-protected-payment-systems.json` |

External operational references:

- [Supabase Data API and PostgREST error codes](https://supabase.com/docs/guides/api/rest/postgrest-error-codes)
- [Supabase compute and disk behavior](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Supabase database connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [PostgreSQL `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [Supabase Management API logs migration](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint)

## Open Decisions

The following are intentionally deferred until instrumentation exists:

- whether the second Mongo source read is materially expensive;
- whether Delivery should receive a request-source factory;
- whether source and overlay cross-request caches improve p95 enough to justify
  coherence machinery;
- whether trusted Edge timing reaches the CMS through bounded internal response
  metadata or aggregate log correlation; the initial dashboard requires neither;
- whether a durable benchmark runner belongs in `quality/performance`;
- whether Stripe worker changes ship as `1.1.0` or another new version, based on
  the publication status of `1.0.0`;
- whether Micro materially improves sustained database tails.

No deferred decision may block the initial observability and request-scoped
deduplication work.
