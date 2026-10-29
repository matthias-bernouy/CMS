# Delivery Performance Plan

Status: design TODO. Measurements describe the reviewed revision; the phases
below are not implemented unless explicitly identified as current behavior.

## Measured Baseline

Measured on 2026-10-29 against images built from `4d6cac938`, on an isolated
Docker stack with a loopback client on a 16-core host. Figures are server cost
without network latency.

| Warm request | p50 | Internal HTTP calls | Mongo operations | Throughput |
| --- | --- | --- | --- | --- |
| Page with literal Blocs only | 17.5 ms | 2, plus ticket closure | 21 | ~110/s |
| Page using image-capable Blocs | 44.6 ms | ~8 | 66 | 2/s sustained |
| Immutable CSS/JS asset | 11.9 ms | 3 | ~12 | 232/s |

At 32 concurrent clients the Provider used about 130% CPU, MongoDB about 80%
and the Edge about 35%. The Provider saturates first.

### Where A Simple Page Request Spends Its Time

| Interval | Work | Mongo operations |
| --- | --- | --- |
| 0–5 ms | Edge request handling and the `gateway.dispatch.prepare` control call | 0 |
| 5–12 ms | Provider authority preparation, sequential, including the root delegation ticket | 7 |
| 12–13 ms | Business call and second Provider authentication | 1 |
| 14–19 ms | Content path resolution; `system` read three times, `blocs` and `page_routes` twice | 11 |
| 19–22 ms | Response streamed back and re-compressed by the Edge | 0 |
| after response | Ticket closure control call | 3 |

Content work is about a quarter of the request. The rest is authority
protocol: two or three internal calls and sequential authority reads.

### Confirmed Causes

- **Quota 503.** `ulvia-official-image` requires `ulvia.cms.files/files.read`.
  Navigation, hero, footer, card and testimonial Blocs include it through
  `uses`, even when a Page contains no image. Content then calls
  `ulvia.cms.installations/capabilities.describe` through the Edge on every
  view (`ulvia-provider-server/src/runtime/content/publicDelivery.ts`). That
  call costs about 18 ms and 40 sequential Mongo operations and consumes the
  Provider call budget of 120 calls per minute per source
  (`cms-gateway/src/access/providers/ProviderAccess.ts`). Such Pages and
  `/admin/pages` return 503 for the rest of the minute.
- **No Edge response cache.** Every public `GET`, including content-addressed
  immutable assets, crosses the Gateway (`cms-edge-server/src/runtime/publicResource.ts`).
- **Delegation ticket on every request.** The official manifest declares
  `delivery.resolve-path` as a delegation source, so every request, assets
  included, writes a root ticket and closes it with another control call.
- **Journal ingestion.** Each log batch is a Gateway command, then
  `MongoJournalStore.ts` upserts entries one at a time into a collection with
  12 indexes: about 50 ms for 15 entries.
- **Wasted compression.** `compress()` computes synchronous Brotli at quality 11
  and gzip on every cache miss: 7 ms for a 7.5 KB Page, 65 ms for 71 KB of
  JavaScript. The Provider's synthetic request has no `accept-encoding`, so it
  always returns identity bytes and the Edge gzips again.
- **Revalidation cost.** A `304` costs the same as a `200`.

## Principle

Every request keeps crossing the Edge. For anonymous traffic the Edge acts as a
CDN over Provider responses, driven by the Provider's HTTP caching headers.
Misses, authenticated traffic and administrator traffic use a reduced Provider
path. Freshness guarantees and purge scope are part of the design and must be
consistent before the Page cache ships; measured gains remain hypotheses until
each phase measures them.

## Decisions (2026-10-29, revised after review)

1. **Edge freshness.** Public Pages send `public, no-cache, s-maxage=15`. The
   Edge applies `s-maxage` and removes it before responding, so browsers still
   revalidate. The guarantee depends on how the write reaches the Edge:
   - a purge-scope command (decision 2) that completed or returned a declared
     error is visible on the next request;
   - a purge-scope command with an unknown outcome is visible within 15
     seconds of the effective write, because the Provider may commit it after
     the purge, once an older response has refilled the cache;
   - other writes, such as asynchronous operations completing inside the
     Provider or operator API changes, appear within 15 seconds of the
     effective write.

   Suspending fills for 15 seconds after an unknown outcome would usually make
   that case immediate. It is an optional improvement, not a guarantee.
2. **Purge scope.** A dispatched command of `ulvia.cms.content` or
   `ulvia.cms.installations` (selections, installations, collections and
   upgrades), whether completed, declared-error or unknown-outcome, clears the
   whole Edge cache before its response is returned. Commands rejected before
   dispatch do not purge. Every other official command is neutral, notably
   `ulvia.cms.observability/logs.append`, which the Edge sends through its own
   Gateway (`cms-edge-server/src/runtime/diagnostics.ts:43`), and the
   authentication commands of `ulvia.cms.access`. A test enumerates every
   official command and fails when one is not classified as purging or
   neutral; `ulvia.cms.files` is classified with evidence, because inline SVG
   rendering reads file bytes. Non-official contracts are neutral while only
   Content and Installations state reaches cacheable HTML. A purge advances a
   generation. A response is stored only if the generation did not change while
   it was loaded, and a request arriving after a purge never joins a load
   started before it. Targeted purge belongs to phase 5.
3. **Exact capability description cache.** Exact invalidation is required for
   this delivery. Content caches `capabilities.describe` results per instance,
   keyed by the current selection revision. The runtime composition reads that
   revision from its own store through the existing
   `ProviderExecutionStateReader` header read: about one operation per request
   that reaches Content, and none for an Edge cache hit. On a miss it reads
   revision R, calls `capabilities.describe` through the Edge, then reads the
   revision again. It stores the result under R only if the revision is still
   R; otherwise the result serves the current request without being stored.
   Failures are not cached. A selection change is therefore reflected on the
   next request that reaches Content.
4. **Server-side query execution.** Dynamic indexing Pages already execute an
   indexing query and render its result into the canonical URL, title and
   metadata variables (`cms-content/src/pages/seo/indexing/resolvePageIndexingMetadata.ts:38`).
   These calls are delegated invocations authorized at call time, and such
   Pages render per request with `private, no-store`. Neither the Provider
   render cache nor the Edge cache stores them. General execution of
   declarative bindings during SSR remains planned and must revisit decisions
   1 to 3.
5. **Contract evolution.** Minor versions of `ulvia.cms.installations` and
   `ulvia.cms.content` are accepted in principle. Each one ships with Edge
   version negotiation and an instance profile update, and only after phase 3
   and 4 measurements justify it. Merging authority preparation with dispatch
   is not planned.
6. **Coordination.** Work in an isolated worktree, one commit per task, with a
   measured before/after per phase. Phase 4 changes to Provider authority
   preparation and authentication material wait until in-flight performance
   work in those files is committed.

## Phases

The order is: reproducible measurement, removal of the 503 with the cheap
compression fix, the asset cache, the Page cache, then the remaining misses.

### 0. Guardrails

Add an opt-in Docker performance journey beside
`tests/integration/instance/instance.docker.test.ts`. It gates operations and
internal calls per view, the cache hit ratio and zero Provider work per hit.
The no-503 scenario runs **with the Edge cache disabled**, across several
distinct Pages and administrator reads, for more than one minute so it spans
two quota windows. That scenario stays in the journey after the cache ships,
so a later phase cannot mask a quota regression. Thresholds start at the
baseline and tighten after each phase. The [agent guardrails plan](gardes_fous.md)
runs the journey in `verify:full` and nightly CI.

### 1. Remove The 503 And Wasted Compression

- Apply decision 3 in `ulvia-provider-server/src/runtime/content/publicDelivery.ts`
  and keep one capability analyzer per instance instead of one per request.
  Entry criterion: the revision re-read of decision 3 is specified before
  implementation.
- Test that a selection change during a `capabilities.describe` call never
  stores the description under the earlier revision, and that the next request
  after a selection change uses the new access levels.
- Compute Brotli and gzip variants on first negotiation instead of on every
  `compress()` call (`http-runner/src/core/compression/content.ts`). Only
  `cms-content` and `ulvia-provider-server` use the helper, and the Edge never
  forwards `accept-encoding`, so the variants are unused today and lazy
  computation changes no response.

Expected: Pages using image-capable Blocs at about 18 ms and 21 operations per
view with no 503; cold render −7 ms and first runtime asset −60 ms (measured
in isolation).

### 2. Edge Cache For Immutable Assets

Wrap `gateway.invoke` in `cms-edge-server/src/runtime/publicResource.ts`:

- key on the canonical `resolve-path` input: path, the **ordered** query list
  without sorting (the contract transports an ordered list, and repeated
  parameters keep their meaning), `accept` and normalized `acceptLanguage`;
- serve only requests without a session cookie or Bearer credential;
- bypass lookup and fill for requests carrying `Range` or `If-Range`, and
  never store a `206`;
- fill with an unconditional `GET` by removing `ifNoneMatch` from the
  forwarded input, then answer conditional requests locally; never store a
  `304`;
- serve `HEAD` from a stored entry; forward a `HEAD` miss without filling;
- store `200` responses with explicit freshness only in this phase, never
  `private`, `no-store` or 404;
- keep identity bytes and a gzip variant computed once, select one by
  `Accept-Encoding` and send `Vary: Accept-Encoding`;
- bound bytes per entry and in total, the number of concurrent fills and the
  waiters per fill; stream a response that exceeds the entry bound without
  caching it;
- log hits and misses with `Age` and `x-cache`.

This phase caches responses that are already `immutable` and changes no
contract. Expected: under 0.5 ms and no Provider work per hit.

### 3. Edge Cache For Pages

- Apply decisions 1 and 2, including the command classification test.
- Key in-flight loads by purge generation. A purge detaches them: requests
  already waiting keep their result, and later requests start a new load.
- Extend `safeCachePolicy` in `cms-edge/src/http/resourceResponse.ts` to accept
  `s-maxage`, `stale-while-revalidate` and `stale-if-error`.
- Freshness tests: publication, unpublication, updates, route changes, site
  visibility and language, theme, site Blocs, collection installation and
  upgrade, and selection changes are visible on the next request when their
  command completes through the Edge, and within 15 seconds of the effective
  write otherwise. Log delivery from cache hits must not purge.
- Concurrency tests: a request arriving after a purge never joins a load
  started before it, and a command with an unknown outcome whose write commits
  after the purge becomes visible within 15 seconds of that write.
- Security tests: credentials, private responses, 404 and dynamic indexing
  Pages are never cached; unkeyed headers cannot alter a cached response.
  Restricting the indexing capability's access exposes no query data and
  leaves nothing in either cache.
- Document the freshness guarantee in
  [Content delivery](../architecture/content-delivery.md).

Expected: anonymous hits at about 0.3–0.5 ms with no internal call or Mongo
operation; throughput then bounded by the Edge.

### 4. Reduce Misses Without Contract Changes

| Task | Location | Expected gain per miss |
| --- | --- | --- |
| Read `system` and `blocs` once per operation, keeping the ordered route/settings fence | `cms-content` reader and `pageRenderInputs` | −2 operations, −1 ms |
| Remove duplicate installation and secret-key reads in dispatch preparation and parallelize independent reads | `…/authority/prepareDispatch.ts`, `issueInvocation.ts` | −3 operations, −2 to 3 ms |
| Write journal batches with one unordered `bulkWrite` and review the 12 indexes | `MongoJournalStore.ts` | batch of 15 entries from ~50 ms to ~5 ms |

Expected: about 13 ms and 16 operations per miss, about 150 views per second.

### 5. Protocol Evolutions, After Measurement

- Issue root delegation tickets lazily, on the first delegated call: −4
  operations and −1 internal call per miss.
- Combine Provider authentication, authorization and preparation into one
  control call for Provider-to-Provider invocations.
- Carry `Vary` and cache tags in resource metadata for targeted purge.

## Review Outcomes (2026-10-29)

### First Review

An external review of this plan agreed with its direction and raised five
points. All five were accepted; the reasons follow.

| Point | Verdict | Reason | Change |
| --- | --- | --- | --- |
| Contradictory freshness: up to 20 s for selections versus "immediate" for writes through the Edge | Agreed | After an Edge purge, a miss could still use a 5-second stale description and the Edge would keep the result for 15 seconds. The promise and the decision could not both hold. | Decision 3 keys descriptions on the selection revision. A 5-second fallback was kept, then removed by the second review. |
| "Every command purges" includes logs | Agreed, confirmed in code | The Edge sends `logs.append` through its own Gateway. Purging on it would evict the cache on every log batch, including batches describing cache hits. | Decision 2 limits purging to dispatched Content and Installations commands and adds a classification test. |
| "No query data is server-rendered" is too broad | Agreed, confirmed in code | Dynamic indexing Pages render query results into their metadata today. The protection is live authorization of those calls and `private, no-store`, not the absence of SSR. | Decision 4 states the precise guarantee; phase 3 adds a restriction test. |
| Asset cache rules are incomplete | Agreed | Without explicit rules a `206`, `304` or `HEAD` response could become a complete entry, and sorting the query would merge distinct ordered parameter lists. | Phase 2 specifies ranges, conditionals, `HEAD`, statuses, encodings, ordered keys and fill bounds. |
| The no-503 check must not benefit from the cache | Agreed | A repeated single Page served from the Edge cache would hide a persisting quota problem. | Phase 0 keeps a cache-disabled, multi-Page, administrator, multi-minute scenario permanently. |

Two nuances were kept. The compression fix moves to phase 1 as suggested, but
as lazy variant computation rather than removal, so no consumer of the helper
changes behavior. The expected gains of phases 1 to 3 rest on measured target
states (17.7 ms for a Page without the description call, 0.11 ms for an Edge
response without the Provider); they are still confirmed by before/after
measurements.

### Second Review

The second review found the plan usable, recommended starting phases 0 to 2,
and asked to settle four concurrency and guarantee points before the Page
cache. All four were accepted, with one timing correction.

| Point | Verdict | Reason | Change |
| --- | --- | --- | --- |
| An unknown outcome cannot promise immediate visibility | Agreed | The Provider may commit after the Edge purge. A fill between the purge and the commit stores the old version, and its expiry only bounds the delay to 15 seconds after the effective write. | Decision 1 distinguishes completed commands from unknown outcomes; fill suspension is recorded as optional. |
| The revision-keyed cache under a concurrent selection change | Agreed, with a timing correction | Reading the revision before the call only risks storing a newer description under an older key, but that relies on `capabilities.describe` rechecking the selection before returning. A re-read makes the rule explicit without changing the contract; a response carrying its revision would change the `capabilities.describe` output. On the Edge, joining a load started before a purge would return pre-write content to a request that arrived after the write. The Content half is decision 3, delivered in phase 1, so it is settled before phase 1 rather than phase 3. | Decision 3 re-read; phase 1 entry criterion and test; phase 3 generation-keyed loads and concurrency tests. |
| Two guarantees remained in the document | Agreed | Tests and the exit condition promised immediate selection visibility while the fallback allowed 20 seconds. One delivery needs one guarantee. | Exact invalidation is required; the 5-second cache moved to rejected alternatives. |
| "One operation per view" | Agreed | An Edge cache hit must keep zero Provider work. | Decision 3 counts per request reaching Content. |

## Rejected Alternatives

- **5-second description cache.** Simpler, but combined with the Edge cache a
  selection change could lag by up to 20 seconds, which contradicts the
  freshness guarantee. Exact invalidation costs about one operation per request
  reaching Content.
- **Description response carrying its revision.** It would remove the re-read
  but changes the `capabilities.describe` output contract.
- **Resolving descriptions locally without the Edge.** Faster, but it bypasses
  the uniform Edge authority, audit and observability path chosen for every
  capability call.

## Confidence

Phases 1 to 3 have high confidence: their target state was measured or is an
in-memory read. Phases 4 and 5 are estimates derived from the measured request
timeline, at about 1 ms per sequential operation and 2 to 4 ms per internal
HTTP call. Each phase replaces its estimate with a measured before/after.

## Out Of Scope

Multi-process Edge and Provider deployments; see
[High Availability](../TODO.md#high-availability). Purge would then need
cross-process propagation.

Exit condition: with the Edge cache disabled and enabled, the performance
journey shows no 503 at 200 views per minute across several Pages using
image-capable Blocs and administrator reads. Anonymous hits perform no Provider
call or Mongo operation. Purge-scope commands that complete, including
selection changes, are visible on the next request; unknown outcomes and other
writes appear within 15 seconds of the effective write. Misses stay within the
tightened budget.
