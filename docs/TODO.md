# Open Platform Work

Status reviewed on 2026-10-25 against `codex/alpha-v0`. This list includes
confirmed defects and deliberately deferred work. None of the completion
criteria below describe an implemented guarantee. See the [audit](AUDIT.md)
for evidence and priorities.

The intentionally incompatible redesign of contracts, Provider authority,
collection examples, Content delivery, SSR and the public Edge is tracked in
the [Platform V2 architecture plan](TODO/platform_v2.md).

## Delivery And Verification

**Status:** static checks, build and ordinary tests pass locally; complete CI
and fresh-container verification have known blockers.

- Replace the removed prebuild tool in the shared GitHub setup action.
- Reconcile the coverage baseline with current packages and source paths.
- Update the two high-severity development-tooling dependencies identified by
  the audit, then rerun the online advisory check.
- Supply an explicit stack version to the unbundled fresh-install smoke and
  prove that its images come from the candidate commit.
- Align branch triggers with the active delivery branch and avoid redundant
  executions of the same smoke journey.
- Add real Mongo adapter tests for index uniqueness, concurrent writes,
  transactions where supported and recovery after interruption.
- Repair `bun run test:performance`. It fails to typecheck and to run since
  `prepareCollectionMigration` was removed in `9234fcfd7`, and it is not part
  of `check:all`, `verify` or CI.

Exit condition: a clean checkout passes the complete delivery gate and one
fresh container/proxy journey against the software being reviewed.

## Rendering Budgets And Content Delivery

**Status:** request coalescing, revision checks, stale revalidation and several
request/byte budgets exist. Page render inputs still include the complete Bloc
catalogue, and their per-path cache has no capacity bound.

- Bound cache entries, retained bytes and concurrent pending loads; handle
  negative paths without retaining a full snapshot for every arbitrary URL.
- Resolve the Page's transitive Bloc, behavior, text and asset dependencies
  before transfer. Adding unused resources must not increase its payload.
- Give each Content delivery projection a validated wire schema. String chunks
  containing JSON do not validate the nested object or its upgrade compatibility.
- Test revalidation failures, invalidation races and changes made outside the
  current Edge, and document the chosen freshness guarantees.

Exit condition: deterministic tests bound calls, bytes and retained resources
as unrelated Pages, Blocs and requested paths grow.

## Delivery Performance And Edge Cache

**Status:** measured on 2026-10-29 against images built from `4d6cac938`, on an
isolated Docker stack with a loopback client on a 16-core host. The Edge has no
response cache: every public `GET`, including immutable assets, crosses the
Gateway. `ulvia-official-image` requires `ulvia.cms.files/files.read`, and
navigation, hero, footer, card and testimonial Blocs include it through `uses`.
Pages using them call `ulvia.cms.installations/capabilities.describe` through
the Edge on every view. That call consumes the Provider call budget of 120
calls per minute per source (`ProviderAccess.ts`), so these Pages and
`/admin/pages` return 503 after about 120 views per minute.

| Warm request | p50 | Internal HTTP calls | Mongo operations | Throughput |
| --- | --- | --- | --- | --- |
| Page with literal Blocs only | 17.5 ms | 2, plus ticket closure | 21 | ~110/s |
| Page using image-capable Blocs | 44.6 ms | ~8 | 66 | 2/s sustained |
| Immutable CSS/JS asset | 11.9 ms | 3 | ~12 | 232/s |

Content work is about 5 ms of a simple Page request. The rest is authority
preparation, a second authenticated call, the root delegation ticket and Edge
re-compression. The Provider saturates one CPU core first.

Every request keeps crossing the Edge. For anonymous traffic the Edge acts as
a CDN over Provider responses; misses, authenticated and administrator traffic
use a reduced Provider path.

### Decisions (2026-10-29)

1. **Edge freshness.** Public Pages send `public, no-cache, s-maxage=15`. The
   Edge applies `s-maxage` and removes it before responding, so browsers still
   revalidate. Writes the Edge does not observe appear within 15 seconds.
2. **Purge v1.** Every command dispatched through the Edge, whether completed,
   declared-error or unknown-outcome, clears the whole Edge cache before its
   response is returned. A purge generation prevents storing a response that
   was fetched before the purge. Targeted purge belongs to phase 5.
3. **Capability description cache.** Content caches `capabilities.describe`
   results per instance for 5 seconds, with one shared load and no cached
   failures. Page access analysis governs rendering and caching, not invocation
   authority, and no query data is server-rendered yet. A Page access level may
   lag a selection change by up to 20 seconds. Revisit before server-rendering
   query data; phase 5 replaces the delay with exact invalidation.
4. **Contract evolution.** Minor versions of `ulvia.cms.installations` and
   `ulvia.cms.content` are accepted in principle. Each one ships with Edge
   version negotiation and an instance profile update, and only after phase 3
   and 4 measurements justify it. Merging authority preparation with dispatch
   is not planned.
5. **Coordination.** Work in an isolated worktree, one commit per task, with a
   measured before/after per phase. Phase 4 changes to Provider authority
   preparation and authentication material wait until in-flight performance
   work in those files is committed.

### Phases

- **0. Guardrails.** Add an opt-in Docker performance journey beside
  `tests/integration/instance/instance.docker.test.ts`. It gates operations
  and internal calls per view, the absence of 503 at 200 views per minute, the
  cache hit ratio and zero Provider work per hit. Thresholds start at the
  baseline and tighten after each phase.
- **1. Remove the 503.** Apply decision 3 in
  `ulvia-provider-server/src/runtime/content/publicDelivery.ts` and keep one
  analyzer per instance. Expected: about 18 ms and 21 operations per view.
- **2. Edge cache, immutable assets.** Wrap `gateway.invoke` in
  `cms-edge-server/src/runtime/publicResource.ts`. Key on the canonical
  `resolve-path` input and serve only requests without a session cookie or
  Bearer. Store public responses with explicit freshness only, never
  `private`, `no-store` or 404. Bound bytes per entry and in total, store the
  gzip body once, coalesce misses, answer `304` and `HEAD` locally, and log
  hits and misses. Expected: under 0.5 ms and no Provider work per hit.
- **3. Edge cache, Pages.** Apply decisions 1 and 2, extend `safeCachePolicy`
  in `cms-edge/src/http/resourceResponse.ts`, and add `stale-if-error`.
  Test publication, unpublication, updates, route changes, site visibility and
  language, theme, site Blocs, collection installation and upgrade, and
  selection changes. Test that credentials, private responses and 404 are never
  cached and that unkeyed headers cannot alter a cached response. Document the
  freshness guarantee in [Content delivery](architecture/content-delivery.md).
- **4. Reduce misses without contract changes.** Read `system` and `blocs`
  once per operation, keeping the ordered route/settings fence. Remove
  duplicate installation and secret-key reads in dispatch preparation. Write
  journal batches with one unordered `bulkWrite` in `MongoJournalStore.ts` and
  review its 12 indexes. Stop eager Brotli and gzip in the Provider. Expected:
  about 13 ms and 16 operations per miss.
- **5. Protocol evolutions, after measurement.** Sign the selection revision
  for exact description invalidation, issue root delegation tickets lazily,
  combine Provider authentication, authorization and preparation into one
  control call, and carry `Vary` and cache tags in resource metadata for
  targeted purge.

Multi-process Edge and Provider deployments stay out of scope; see
[High Availability](#high-availability). Purge would then need cross-process
propagation.

Exit condition: the performance journey shows no 503 at 200 views per minute
for Pages using image-capable Blocs. Anonymous hits perform no Provider call or
Mongo operation. Writes through the Edge are visible on the next request and
other writes within 15 seconds. Misses stay within the tightened budget.

## Internal Persistence Migrations

**Status:** collection-owned content migrations are implemented. Internal
MongoDB documents do not share an ordered schema-migration registry.

Add feature-owned, idempotent migrations with a durable applied-version ledger,
single-writer fencing and restart recovery before changing long-lived internal
schemas. Define the supported read/write compatibility window for each change.
An image rollback must not imply that the data has been rolled back.

Exit condition: upgrade with interruption, resume, compatible image fallback
and complete restoration are exercised against real persistence.

## Backup And Operational Recovery

**Status:** the CLI preserves persistent state across stops and pins exact
images. A failed upgrade attempts to restore the previous image; there is no
general data-rollback or automated backup/restore command.

Exercise complete backups containing MongoDB, file blobs, Repository state,
instance definitions and matching encryption material. Restore to an isolated
installation and verify credentials, Pages, routes, media and exact artifact
pins. Test missing historical keys, interrupted publication, proxy/TLS behavior
and shutdown while work is active. Diagnostic logs do not replace durable
domain audit records or recovery evidence.

## Collection JavaScript Isolation

**Status:** collection JavaScript executes as trusted code in the Edge
document. The MVP's reviewed first-party release assumption is an operational
trust policy, not a technical publisher allowlist or a sandbox.

Community publication and installation need separate decisions about execution
authority. A namespace signature proves ownership and integrity, not safety.
Static API checks and scoped CSS provide validation and encapsulation only.

Two designs need explicit evaluation before activation:

- site approval of main-document execution for an exact publisher and release
  digest, with clear browser authority and upgrade acknowledgements;
- an isolated runtime with bounded host-mediated effects for code that must
  not receive the surrounding document or ambient browser authority.

A lazy Worker or equivalent realm per immutable collection release is a
candidate for the second design, not an adopted collection protocol. Prototype
DOM interaction, mixed-collection slots, native forms, focus, accessibility and
failure handling first. Avoid one visible iframe per ordinary Bloc instance.
Visible sandboxed iframes remain useful for autonomous embeds.

Exit condition: the selected trust model is explicit and tested. If isolation
is claimed, demonstrate cross-collection separation, declared effects, bounded
messages, timeouts and termination without breaking the host Page.

## Browser Mutation Provenance

**Status:** the session cookie is `HttpOnly`, `SameSite=Lax` and secure on HTTPS,
but the generic capability boundary does not enforce one centralized
`Origin`/`Sec-Fetch-Site` policy for cookie-authenticated commands.

Define a Edge-boundary policy covering logical mutations and canonical
binding routes. Preserve bearer clients and native multipart uploads;
distinguish absent headers from an explicit foreign origin. Verify same-site
cross-origin cases, proxy/TLS deployment and authentication effects. Request
provenance complements actor authorization; no capability-specific CSRF rules
or Page/Referer grants are required.

## Editorial Completion

**Status:** nested editing, native fields, a media picker, site compositions
and local undo/redo exist. The end-to-end product gate is incomplete.

Complete [the first published Page](product/first-published-page.md), including
starters, media selection, alternative text, saved-preview correctness,
publication and restart. Exercise two-tab conflicts, interrupted uploads,
rejected saves and leaving with unsaved edits. Local editor undo is not durable
Page history. Dynamic-data authoring remains outside this initial slice.

## High Availability

**Status:** one active Edge per instance, one Provider process and one active
official-repository writer are assumed. Leases protect implemented critical
sections; multi-replica failover is not proven.

Treat horizontal replicas as unsupported until migrations, background jobs,
publication, cache invalidation and recovery have split-brain and
ownership-loss tests. Community namespaces and the generic MCP binding remain
planned work; they do not change the current deployment guarantees.
