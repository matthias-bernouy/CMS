# Events, Workflow and local laboratory verification — 2026-11-24

## Result and scope

The functional verification passed. The separate measured performance assessment failed and remains open.

Core workspace: `/home/matthias/.codex/worktrees/contract-events-workflow-manifests/CmsCore`, branch `codex/contract-events-workflow-manifests`, base `66d25ba9b3ff1cc5c00dc1ed091d28e66aea32bf`. The existing implementation changes remain uncommitted in this task worktree. The main checkout was not edited.

The separate local Git repository is `/home/matthias/.codex/worktrees/workflow-lab`, with no remote. Live tests targeted the updated preview at `http://127.0.0.1:4318/`. The original `4317` deployment and both original browser editor states were preserved. Synthetic mail was captured locally only.

## Corrections found during verification

1. Reusing a manual run ID with different valid input returned HTTP 503. `WorkflowRuns.start` now translates the immutable value conflict into the existing `RUN_CONFLICT` refusal. The original input and run remain unchanged; exact replay still succeeds. No contract, schema or persistence format changed.
2. Concurrent Provider observation could persist the approved connection and then lose its revision race, causing Registry initialization to report that observation was missing. `ProviderConnectionWorkflow.approve` now rereads the installation after an observation exception and accepts an already persisted observation only for the exact unchanged approved installation. Disabled, revoked or reconnected installations do not pass that reconciliation.
3. The lab tried to create an Event trigger when publishing an installed manual package. It now returns a published manual plan with no trigger.
4. Workflow settings could lose their latest text when the inspector rerendered before a change event. Valid identity/name/version input now updates the editor model during typing; browser verification confirmed the exported package identity.
5. The lab's Form query did not request the published version, allowing the tester to fall back to an unpublished draft. It now reads the current immutable publication explicitly. A live test keeps a different unpublished draft and successfully submits against the published schema.

The lab also sorts its loaded run page by creation time and labels the 100-entry bound accurately. This display order does not establish business Event ordering.

The manual-run correction adds no persistence calls. Provider observation reconciliation adds one installation read on the exception path; normal successful approval adds no call. This is a code-path count, not a latency claim. `WorkflowRuns` remains a cohesive 189-line lifecycle class; its size warning was reviewed. The already large Provider connection workflow remains cohesive at 242 lines. No directory-fanout error remains.

## Automated evidence

Initial `bun run check`: ten checks passed before implementation changes. Final `bun run verify`: exit 0, including all ten checks and the following stages:

| Stage | Observed result |
| --- | --- |
| Ordinary suite | 4,631 passed, 143 explicit skips, zero failures; 41,653 assertions |
| Collection animation browser journey | 4 passed |
| Capture / CLI preview browser journeys | 11 passed |
| Content recovery, observability and templates | 18 passed |
| Enabled Forms, Events and Workflow Mongo suites | 29 passed |
| Real Forms / initiator HTTP journey | Passed |
| Shared hosting, restart and two Edges | Passed, 216 assertions |
| TLS fresh / restart journeys | Both passed, 18 / 19 assertions |
| Performance plan, compatibility and harness checks | Passed within `verify` |

These stage counts are reported separately; some enabled suites repeat ordinary tests. The skipped ordinary tests are not counted as successful executions. Enabled stage logs retain their individual coverage.

Five new regression cases cover the two core corrections:

- `packages/features/workflows/tests/compiler.test.ts`: changed-input identity conflict, unchanged original input, one retained run, and successful exact replay.
- `packages/features/repository/tests/providers/workflows/connections.test.ts`: observation reconciliation for unchanged, disabled, revoked and reconnected installations.

The focused combined run passed 14 tests / 44 assertions. Formatting and whitespace checks passed.

The enabled Mongo suites also cover 65-recipient durable fanout, subscription generations, source identities, schema seals, unconfirmed publication recovery, expired leases, cross-instance run receipts, seven-day run/orphan cleanup, thirty-day deduplication and the 24-hour delivery window. Retention and delivery-window tests advance controlled clocks against real Mongo persistence; they do not wait for those durations in wall time.

## Live laboratory evidence

`scripts/initiators.ts e2e` passed twelve live checks through actual Edge, Provider, Mongo, Registry and SMTP services:

- Manual publication, false/true condition branches, correct output and one captured effect; six simultaneous replays retain one run/effect. Changed or invalid input is refused.
- Compiler diagnostics, unpublished-plan refusal, optimistic revision conflicts and rejected publication without execution.
- A failed capability step, dependency repair and checkpoint resume to success.
- Declared-error branching, cancellation, terminal-state refusals and publication retirement.
- Native resource picker/schema resolution and refusal of sensitive-field mappings.
- Eight simultaneous identical Form submissions produce one receipt, one run per intended consumer and one notification; another form does not cross the filter. Invalid original payloads are refused.
- Anonymous versus verified user provenance, scoped alias resolution, tampered-reference refusal, plain-browser capture refusal and authenticated-form anonymous refusal.
- Compatible dynamic schema publication remains executable; removing a consumed field suspends the consumer with a diagnostic. A stale trigger revision is refused.
- Published Form data remains usable while a different draft stays unpublished.
- Anonymous, ordinary-member and foreign-instance cookies receive HTTP 401/403 on Workflow management and delivery diagnostics. A valid reconstructed wire envelope and a valid publication request receive HTTP 403 when an ordinary browser administrator attempts to impersonate the delivery service or producer. Refusals leave runs unchanged and create no forbidden definition.
- Local immutable Registry release, incorrect-digest refusal, exact-digest installation, manual publication/execution, stale configuration refusal, version upgrade and installation removal. Completed runs remain readable.

`scripts/initiators.ts restart-check` passed: a queued accepted run survived a real Provider SIGKILL/restart, completed once, and remained deduplicated on replay. The local image update also preserved the preexisting run IDs, mail IDs and active triggers.

Six editor tests passed with 21 assertions. Final lab syntax/build checks parsed 38 modules; live Host, Origin, private-path and invalid-input checks passed. Live-test commands refuse the original/default profile. Synthetic fixtures retain their diagnostics and completed runs; their Event triggers are deactivated and published plans retired.

Browser testing used a separate `localhost:4318` origin. It covered name/package identity editing, trigger mode switching, stale binding diagnostics, condition removal, constant mapping, manual publication/run, Form creation with authenticated access, native resource selection, Event publication/activation, submission and replay. The Event run was visibly `succeeded`. Screenshot: `.state/initiators/workflows-e2e-verified.png` in the lab repository. The temporary browser-test trigger was deactivated afterward.

## Measured performance: failed, unresolved

Eight nominal HTTP scenarios were attempted with the normal performance command. Immutable result: `artifacts/performance/runs/20261124T141943Z-66d25ba9b3ff-0c1bc62d/results.json`; readable report: `report.html` in the same directory. Result: zero passed, one failed and seven blocked; zero covered obligations. The source stayed unchanged during measurement.

Evidence and remaining work:

- `events.publish` returned validated HTTP 200 for ten samples, but only five had complete instrumentation. The Provider's untraced probe metadata reached its bounded writer limit and emitted overflow markers. Establish bounded measurement windows without discarding measurement failures or increasing budgets merely to pass.
- The `initiators.capture` fixture requested machine authority from the official Provider, whose admitted requirements do not include that capability. HTTP 403 is expected. Use a dedicated producer fixture declaring that requirement; native Forms receives its trusted capture port directly. Production authorization was not expanded for the benchmark.
- MongoDB in the isolated measured stack exited with code 137 and `OOMKilled=true` under its configured 1 GiB limit. The resolve scenario retained five samples before collection failed; subsequent preparations failed. Diagnose fixture/database lifetime and memory consumption before deciding on any resource-budget change. The current evidence does not establish the allocation responsible for the OOM.

No latency, throughput or performance-budget success is claimed. The earlier Registry observation startup failure was corrected and an isolated instrumented startup plus authenticated authoring call passed, but that does not validate the later measurements.

## Remaining boundaries and evidence locations

The live UI has only one real declared business Event source in its initial catalogue: Forms. Generic payment declarations are covered by editor/domain tests; no external payment, Shopify, Commerce or purchase-verification Provider was installed. There is no external webhook journey in this V1. The compact UI retains a current editor in localStorage and loads bounded metadata pages; it is not a production administration interface.

Crash recovery has unit/Mongo interruption coverage and a real queued-run process kill. It does not prove every possible instruction-boundary crash or exactly-once effects in an arbitrary external non-idempotent service; uncertain effects use the existing suspension/reconciliation semantics.

Persistent command logs: `/home/matthias/.codex/logs/CmsCore-workflows-e2e-2026-11-24-*.log`. Live case records remain under the lab's ignored `.state/initiators/e2e/`. Credentials and mail payloads remain private local state. Nothing was pushed or published remotely.
