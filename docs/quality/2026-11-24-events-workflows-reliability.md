# Events and Workflow Reliability Review — 2026-11-24

This follow-up records the authorized reliability corrections to the unreleased Events/Workflow implementation. It does not replace the historical [2026-11-23 implementation review](2026-11-23-events-workflows-review.md). Changes remain in `codex/contract-events-workflow-manifests`, without a commit, push or merge.

## Implemented behavior

- A delivery addressed to a superseded trigger generation is acknowledged without a new run. It cannot suspend the replacement trigger.
- Event source identity depends on its owner, event type and declaration fingerprint, rather than the entire contract digest. Unchanged event declarations retain subscriptions across unrelated contract releases. Changed declarations remain isolated and produce a source diagnostic, including the changed schema path. Schema queries still pin the exact current selected capability release.
- Installed plans remain inaccessible until a durable installation publication decision is confirmed. Interrupted confirmation resumes from that decision without recompiling. Configuration/removal cannot replace a pending decision. Maintenance fencing and dependency inventory include committed pending decisions, while uncommitted plans do not become executable consumers. Local draft publication also protects unfinished intent against concurrent edits.
- Publication freezes a committed subscription generation. Its recipient set is scanned in durable batches of at most 64, reducing batch size if the byte limit requires it. An interrupted handoff retries the same batch and cursor. Later subscribers are excluded; subscription changes cannot redirect frozen deliveries. A 65th subscriber no longer rejects the producer's event.
- A source/resource/version is sealed to one validated schema digest. A conflicting descriptor returns `RESOURCE_VERSION_CONFLICT`; active workflows receive a resource-version diagnostic and new workflow publication is blocked.

## Agreed delivery and conservation policy

Event delivery retries span 24 hours from acceptance, with exponential delays from five seconds to one hour and no earlier fixed attempt-count cutoff. Expired deliveries expose `DELIVERY_EXPIRED`. Authorization refusals remain terminal.

Publication and outbox payload copies have independent 24-hour Mongo TTLs. Read paths enforce expiry even before physical TTL deletion. Terminal handoffs can clear payloads earlier. Publication receipts and delivery metadata are retained for 30 days. A producer retry within the retained receipt returns the same accepted occurrence. Once that receipt expires, a new opaque occurrence generation prevents collisions with old outbox/inbox metadata awaiting physical deletion.

The explicitly authorized `deliveries.list` capability returns only identifiers, subscription revision, state, attempts, next attempt and failure code. Administrator readers select a current consumer contract; Provider readers retain their installation scope. Cursors include the database and complete logical-consumer owner. Server-side projection excludes payloads, selectors, fingerprints and capability targets. This adds no generic event-history or payload-reading API.

Succeeded, failed and cancelled runs are purged seven days after their terminal checkpoint. Resume cancels a failed run's scheduled purge. Queued/running/waiting/suspended/uncertain-outcome runs retain recovery data. Cleanup reserves the run before bounded root/chunk deletion and resumes after interruption. Minimal inbox tombstones preserve the 30-day deduplication window.

The user also authorized purging seven-day preparations with no registered run. A scope is recorded before chunk writes. Orphan cleanup atomically reserves an absent run identity before deletion; a concurrent accepted run wins or refuses at that same key. Existing runs survive an interrupted scope-acceptance update. This also reclaims chunks whose root write never completed. Cold discovery probes due run purges, due orphan scopes and unfinished confirmation/cleanup.

Published configuration, immutable plans, schema seals and subscription configuration have separate domain lifecycles. The seven-day rule applies to run values and unaccepted run preparations, not arbitrary configuration data or copies held by an external capability.

## Evidence

| Check | Result on the final executable source |
| --- | --- |
| Initial `bun run check` | 10 passed, 0 failed |
| Final `bun run verify` | Exit 0 in the same task worktree |
| Static checks | 10 passed, 0 failed |
| General tests | 4,599 passed, 138 conditional skips, 0 failed |
| Collection style browser journey | 4 passed |
| Capture/preview/browser journeys | 11 passed |
| Content/log/template Mongo journeys | 18 passed |
| Forms/Events/Workflow standalone Mongo journeys | 26 passed |
| Performance tooling | Types passed; 312 executors / 2,333 scenario definitions; no missing definitions or budgets |
| Retained compatibility | Passed; no real performance measurement campaign |
| Final images / real Forms → Events → Workflow | Rebuilt; journey and cold recovery passed |
| Edge smoke | Passed |
| TLS | Fresh and restart journeys passed |

The persistent full log is `/home/matthias/.codex/logs/CmsCore-events-workflows-reliability-2026-11-24-verify.log`. The baseline is retained beside it. This root documentation note was added after verification; executable source and feature documentation were unchanged afterward.

Focused regression evidence:

- [Trigger generations and authority](../../packages/features/workflows/tests/domain-events.test.ts): obsolete delivery cannot change a repaired trigger; foreign authority is refused before inbox/run writes.
- [Source identity](../../packages/features/events/tests/sources.mongo.test.ts): an existing subscription receives a new occurrence after an unrelated release; changed declarations are distinguished and stale publication is refused.
- [Installed publication](../../packages/features/workflows/tests/resources/mongo-installations.test.ts): failed confirmation leaves no executable plan, committed confirmation survives interruption, and upgrade references cover the committed pending decision.
- [Fanout](../../packages/features/events/tests/bounds.mongo.test.ts): 65 recipients, lost handoff acknowledgement, subscription mutation between pages, no new recipients or duplicate delivery IDs, and interrupted membership recovery on standalone Mongo.
- [Resource seals](../../packages/features/events/tests/resources.mongo.test.ts): concurrent conflicting descriptors, reopen, new resource versions and cross-instance refusal.
- [Delivery policy and metadata](../../packages/features/events/tests/delivery.mongo.test.ts): a simulated 24-hour window, capped backoff, owner-scoped pagination, no payload fields, independent expiry dates, and new occurrence identity after receipt deletion with old outbox data still present.
- [Run and preparation cleanup](../../packages/features/workflows/tests/mongo.test.ts): interrupted deletion, late writes, competing run registration/resume, encrypted root/chunk cleanup, receipt preservation and protection of live/waiting/suspended/uncertain runs.
- [Compiler diagnostics](../../packages/features/workflows/tests/resources/health.test.ts): a conflicting resource version blocks new publication with a precise path.

## Review of shared paths and costs

The shared Mongo outbox is currently composed by the Events runtime and its test fixture. Payload splitting changes both publication recovery and delivery claims; real cross-process delivery and cold recovery passed on rebuilt images. Current source/receiver authorization and exact destination checks remain in place before delivery.

The domain-level zero-subscriber publication budget is five Mongo operations, compared with four before this follow-up. Replay remains two operations and a projected source list remains one. [The operation-count test](../../packages/features/events/tests/cost.mongo.test.ts) checks these counts; they exclude runtime Gateway/authority resolution. New small encrypted value writes add scope/fence metadata operations. Cleanup uses indexed metadata probes and bounded batches, with at most 64 roots/chunks per scope pass. Delivery diagnostic pages load bounded, projected batch metadata. Static performance coverage is not a measured latency/CPU result.

Several cohesive files remain above 180 lines: installation publication service, Mongo definition/run adapters, runtime composition and shared durability tests. Their state transitions, adapter wiring or common crash fixture remain together for readability. Retention/orphan protocols were separated into focused adapters. The persistence directory has eight clear entries, an informational finding; there are no blocking directory-fanout errors.

## Limits and verification history

One earlier verification attempt failed during Repository initialization, before reaching the workflow journey, with an unpersisted Provider observation. Provisioning and Repository connection source were not modified. The same journey passed on focused retry and on the final full verification.

Delivery remains unordered and does not promise exactly-once external effects. Automatic migration of changed static event declarations, a shared dynamic-schema primitive for capability inputs/outputs, business-time ordering, binary steps, webhooks and Gateway call observation were not added in this follow-up. TTL and background cleanup are asynchronous; immutable configuration has its own lifecycle. These limits are distinct from the verified run-data retention policy.
