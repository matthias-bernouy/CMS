# Events and installable Workflows review — 2026-11-23

## Delivered scope

The task branch is `codex/contract-events-workflow-manifests`, based on `66d25ba9b3ff1cc5c00dc1ed091d28e66aea32bf`. The original checkout and previous prototypes remain separate. Changes are uncommitted.

Contracts own business event schemas and stable names. SDK helpers provide typed emission, durable producer ports, standard receivers, resource resolvers and pickers. `@bernouy/cms-events` owns authorized durable publication/subscriptions. `@bernouy/workflows` owns portable manifest admission, encrypted instance configuration, immutable plans, triggers and recoverable execution. Repository, authoring, CLI and the official runtime support the fourth artifact kind, `workflow`.

New CMS instances automatically select Events and Workflow; Forms remains optional. Workflow management is administrator-only. Its fixed receiver additionally requires verified system delivery authority. No editor or administration collection is bundled.

Forms derives resource schemas from its published field definitions. Source changes remain independent across Providers: incompatible consumed fields suspend new workflow starts with a diagnostic, rather than blocking Forms writes. Accepted runs retain their plans and checkpoints. Transient resolver outages defer checks. Repair requires explicit validation/reactivation or run resume.

See the [architecture and lifecycle](../architecture/events-workflows.md), [usage examples](../../packages/features/workflows/docs/examples.md) and [portable contact manifest](../../packages/features/workflows/examples/contact-notification/definition.json). The email text mapping requires a non-empty string schema, including `minLength: 1` on the selected textarea.

## Validation evidence

Frozen dependencies were installed in the task worktree before the initial check. Initial `bun run check`: 10 passed, 0 failed. Final `bun run verify` exited successfully in the same worktree. It includes:

| Stage | Result |
| --- | --- |
| Static check | 10 passed, 0 failed: architecture, bindings, logging, shape, style, types and tooling |
| General suite | 4,594 passed, 125 conditional skips, 0 failed |
| Browser style journeys | 4 passed |
| Browser capture/preview isolation | 11 passed |
| Content, logs and template Mongo integration | 18 passed |
| Forms, Events and Workflow standalone Mongo | 19 passed |
| Performance tooling | Typecheck passed; 311 executors and 2,326 scenario definitions, no missing definitions or budgets |
| Retained implementation compatibility | Passed; static evidence explicitly records `measuredPerformance: false` |
| Forms/Workflow journey | Passed on rebuilt images: typed resource resolution, pushed event, one workflow email, durable cold recovery |
| Fresh shared hosting | Passed: isolated publication, native capture, restart, two warmed Edges and invalidation |
| TLS | Fresh and restarted two-entrypoint Pebble/Caddy journeys passed |

The conditional skips are not failures and are not evidence for optional suites outside the stages above. Verification preceded this documentation-only review file. Local Markdown links and `git diff --check` were checked afterwards. Candidate images were built locally; no deployment or publication was performed.

## Security and recovery checks

- [Events Mongo lifecycle](../../packages/features/events/tests/mongo.test.ts) covers owner refusals, concurrent publication, unchanged receipts across selected contract releases, changed sensitive bytes, frozen recipients, scoped cursors and cancellation tombstones.
- [Publication bounds](../../packages/features/events/tests/bounds.mongo.test.ts) checks payload and fanout refusal before publication/delivery mutation. [Operation counts](../../packages/features/events/tests/cost.mongo.test.ts) checks projected metadata lists.
- [Source-reader authority](../../packages/runtimes/ulvia-provider-server/tests/provider-contracts/native/events.test.ts) checks exact administrator filters and mandatory Provider installation scope. A Provider cannot filter into another installation. Schema metadata conveys no publication authority.
- [Workflow event authority](../../packages/features/workflows/tests/domain-events.test.ts) rejects foreign delivery before inbox/run writes and rejects sensitive or unguarded input mappings at publication.
- [Resource health](../../packages/features/workflows/tests/resources/health.test.ts) covers consumed versus unused field removal, transient outages, explicit reactivation and recovery of interrupted suspension.
- [Workflow Mongo durability](../../packages/features/workflows/tests/mongo.test.ts) covers encrypted values, concurrent inbox receipts, cross-instance attempts, stale leases and retained upgrade references for suspended accepted runs.
- [Installed manifests](../../packages/features/workflows/tests/resources/mongo-installations.test.ts) covers digest refusal before writes, configuration CAS, immutable publication, isolated stores and existing runs after removal.
- [Runner recovery](../../packages/features/workflows/tests/runner.test.ts) covers checkpoints, keyed retries, unknown non-idempotent outcomes, authority loss and incompatible next calls.
- [Invocation tokens](../../packages/platform/gateway/tests/protocol/invocation-token.test.ts) cover signed bounded causation without increasing the token limit. Causation survives ordinary durable context snapshots; authored request headers convey no authority.
- [CLI Workflow transfer](../../packages/runtimes/ulvia-cli/tests/cli/releases/workflow.test.ts) checks release, inferred/all pushes, exact pull, yank/restore and immutable-coordinate retries.

Shared SDK execution and retained contract projections remain covered by the general suite and compatibility stage. These checks establish the tested boundaries; they are not an exhaustive security audit of every external Provider implementation.

## Resource and performance bounds

Before this feature, Forms produced no domain-event publication. Its new publication intent shares the accepted submission document, avoiding a separate intent insert. The generic Events domain test observes four Mongo operations for a new zero-subscriber publication, two for replay and one projected `limit + 1` metadata-list read. These counts exclude runtime Gateway authority refreshes and network calls; they are not end-to-end latency measurements.

Runtime publication fanout is limited to 64 recipients and durable event records to 2 MiB. Current delivery retention is 24 hours with bounded retries. Source discovery, trigger health and recovery use bounded batches; lists use projected pagination. Resource schema bytes, fields, expression expansion, run steps, stored values and causation chains also have explicit bounds. There is no unbounded event-history API.

No throughput or latency campaign was run. `bun run perf` remains the separate measurement command; complete scenario definitions do not prove production performance budgets.

## Deliberate V1 limits

Execution is JSON-only: typed calls, conditions, objects/arrays, paths, parameters, comparisons and declared-error branches. Binary steps, scripts, loops, parallel execution, delays, raw HTTP, Gateway call interception and external webhooks are excluded. Operation steps require a verifiable terminal-result reader; the official adapter currently provides its local operation reader.

Schema compatibility detection is eventual across Providers. Suspended deliveries are acknowledged without creating runs and are not replayed automatically. Closing a silent source does not itself imply a schema incompatibility diagnostic. Source-side schema reservations and Mongo replica-set requirements were not added.

External effects are not guaranteed exactly once. Unknown non-idempotent results need explicit resolution. Recovery rechecks recorded administrator authority; an interrupted installation removal remains pending if that authority is revoked, until it is restored. Configuration and plan/run values are encrypted, while portable Repository manifests are ordinary catalogue artifacts.

Several cohesive files exceed the 180-line advisory threshold, including the Workflow runner/publication store and runtime composition/authority modules. They retain one state machine or composition boundary rather than artificial size-only splits. Directory fanout has no blocking errors.
