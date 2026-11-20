# Capability Performance Assessment

The inventory, scenarios, instrumentation and reports live here. Application
handlers, runtimes and contract definitions must remain unchanged during the
initial assessment. Test fixtures mutate disposable local instances only.

## Execution

For public Page HIT/MISS/BYPASS, expiry, idle-context, process-restart and
stylesheet/invalidation measurements, see the [public cache journey](public-cache/README.md).
It is a separately selectable supplementary command, outside `verify` and the
capability campaign.

For a focused `initialization.plan` campaign, see
[initialization scenario details](scenarios/initialization/README.md) and the
[2026-11-17 measurements](../../docs/development/initialization-plan-performance-2026-11-17.md).
This scope does not resume or certify the exhaustive assessment.

For 30 sequential cold Mossa invocations (15 HTTP and 15 MCP), using retained
local images without changing application code:

```sh
bun run tests/performance/assessment/stability.ts 0.1.0-initialization-cold-2
```

The Provider restarts before each invocation; restart time is outside client
latency. Ordinary invocation evidence and state postconditions are retained.
Post-response cgroup memory/peak/OOM observations are sealed separately under
`artifacts/performance/stability/<run-id>/`. Provider restarts prevent this from
being a test of long-lived Provider heap growth. Shared Edge/Mongo processes
remain running across the campaign. Missing memory observations remain explicit.
The exit status follows the assessment budgets and coverage, even when all 30
business calls succeed. See the [30-call observations](../../docs/development/initialization-plan-stability-2026-11-17.md).

`bun run verify` runs the ordinary validation pipeline, checks this tree's types
and tests, and rejects missing scenario definitions, bindings or budgets. It
also checks retained compatibility and runs the functional browser and TLS
journeys. It does not execute measured performance campaigns or timing budgets.

Use the separate performance command from the workspace root:

```sh
bun run perf --list
bun run perf
bun run perf --scenario initialization.plan.mossa.http.cold
bun run perf --scenario <exact-id-a> --scenario <exact-id-b>
bun run perf --scenario <exact-id> --reference <compatible-run-id>
```

Listing and exact-ID validation happen before any Docker image build, browser
journey or measured stack. Repeated IDs run once in canonical plan order; unknown
IDs and unsupported arguments fail without silently widening the selection.
The command prepares browser outputs and builds its local candidate images once
under `0.1.0-perf`. The full command also runs the supplementary compiler,
Repository and Docker-delivery benchmarks; selected runs skip those unrelated
journeys. No image is published and no production site is contacted.

Selected scenarios share one isolated stack. Their JSON metadata and HTML report
explicitly identify the selected IDs and original plan size. Coverage and budgets
apply to that selection; omitted scenarios cannot become exhaustive coverage.
The complete static plan is still validated before a selected run. Without a
reference, results enforce business checks, complete measurements and absolute
budgets. An explicitly requested reference must be valid and compatible,
including the exact same scenario selection. `ULVIA_PERFORMANCE_REFERENCE` can
also provide it; no compatible reference is invented or selected automatically.

The internal runner remains available for diagnostics with already built images:

```sh
bun run tests/performance/assessment/run.ts <image-version> [reference-run-id]
bun test tests/performance
bun x tsc --project tests/performance/tsconfig.json
```

It tests the independently declared current executor inventory, including
inherited capabilities, on one isolated shared stack. Shared older-contract
aliases do not receive duplicate performance matrices or stacks. Missing
definitions, samples and budgets remain blocking findings. A broken family
fixture does not hide unrelated scenarios; each result is checkpointed before
the next scenario. Reports retain their exact source/image pins and raw metrics.

`verify` also runs `tests/performance/compatibility/run.ts`. The check admits each
retained exact contract with the same SDK compatibility loader used by the
Provider, then records its shared current executor and bindings. It fails on
corrupt, unsupported or duplicated claims. Its separately sealed JSON report is
under `artifacts/performance/compatibility/`; it grants no measured performance
coverage. Existing SDK compatibility tests exercise actual handler execution,
live authorization and refusal of incompatible schemas. A new independent
executor must enter the performance inventory and receive its own scenarios.

The candidate must have current HEAD revision labels and the correct component
and API labels. Docker, MongoDB, Chromium and Python 3 are mandatory. Python uses
only its standard library for bounded source capture and archive verification. The test clients
reject non-loopback origins. Internal machine scenarios use the real Provider
HTTP mount and runtime-issued credentials; ordinary calls retain the Edge and
Gateway path. Hosting uses a private, bounded authoritative DNS sidecar whose
program and resource limits participate in the environment fingerprint.
A bounded authenticated SMTP sink receives synthetic messages and recovery
challenges locally; it cannot forward them. SMTP and DNS program digests and
resource limits are recorded before the run starts. No production credentials,
external DNS records or real mailbox recipients are used.

If Docker's default address pools are exhausted, the disposable network allocator
checks configured Docker subnets and IPv4 host routes before trying a free `/24`
inside `10.253.0.0/16`. This fallback requires Linux `ip` route inspection and
refuses missing inventories or conflicting host/VPN routes. Atomic allocation
races are bounded to four attempts. Networks retain their test ownership labels
and normal internal/ingress separation; cleanup targets the stack's own names.

## Coverage And Metrics

`capabilities/inventory.ts` keeps exact catalogues available for compatibility
inspection and historical evidence. Its performance inventory contains the
current independently declared implementations, including inheritance.
Published templates without an implementation are reported separately. Each
performance target, binding and mandatory variant has its own obligation.
Old aliases are checked separately instead of inflating performance omissions.

The plan and observed execution are checked independently. Preparation,
validation errors, incomplete operations, unread bodies, missing traces and
incomplete metrics cannot cover a nominal obligation. Repeated copies of one
trace cannot satisfy the required sample count.

The test-only preload observes the actual Provider dispatcher, Gateway binding,
Mongo commands and internal HTTP bodies. Mongo's profiler records documents
and keys examined. A successful MCP witness requires both the Gateway's MCP
representation and the actual exact Provider invocation; its internal HTTP
transport alone is insufficient. Inputs, response bodies and credentials are
not written into measurement records.

Budgets are provisional diagnostic ceilings declared before measurement.
They are not calibrated to make the existing implementation pass. Client timing
includes full response consumption; work counters cover the root trace. Handler
spans distinguish business work from routing/authentication overhead. Profiling
and synchronous trace writes add overhead; compare matching instrumentation and
resource profiles rather than treating these timings as uninstrumented production
latency.

## History And References

Runs are immutable directories under `artifacts/performance/runs/`, ignored by
Git. `results.json` contains raw measurements and complete planned/actual
coverage; `report.html` is standalone. `comparison.json` contains reference
findings. `complete.json` is written last and seals the files by SHA-256.
Interrupted, modified, symbolic or oversized artifacts cannot be references.

Before acquiring a measured stack, the runner captures the exact tracked and
untracked non-ignored source under `artifacts/performance/source-snapshots/`.
The archive includes the local patch, file hashes, normalized modes and explicit
deletions. Source identities must remain stable during capture; reuse verifies
every archived member. New reports pin archive and manifest hashes inside their
own immutable metadata. Historical reports remain unchanged and do not gain a
source pin retroactively.

Export the complete report/source bundle and verify it after transfer:

```sh
bun tests/performance/reporting/archive/export.ts . <run-id> /path/to/shared-archive
bun tests/performance/reporting/archive/verify.ts /path/to/shared-archive/<run-id> [expected-run-seal-sha256]
```

The optional expected seal must come from the previously trusted run. Verification
checks run files, source members, source pins and summary counts. Export refuses
existing directories, including incomplete exports; it never selects or promotes
a reference. Complete measured initial baselines can remain over budget, while
missing evidence and shared-host diagnostics prevent timing-reference eligibility.

Build a searchable multi-run latency index from those exported bundles:

```sh
bun tests/performance/reporting/summary/cli.ts /path/to/shared-archive artifacts/performance/summaries
```

Each invocation creates a new sealed derived directory containing `index.html`
and `latencies.json`. Original exports are never modified. Corrupt or symbolic
run evidence fails generation rather than disappearing from the index. Run
seals are checked; source archives remain covered by the export verifier above.
P50/P95 stay separate by exact run and scenario version, include failed timed
attempts, and exclude preparation. Missing metrics remain unavailable. The table
retains budgets, runtime findings, sample counts, work maxima and original-report
links. It never selects a regression reference or turns historical rows into
current-checkout coverage. Limits are 1,000 runs, 100,000 rows and 64 MiB per output.

Supplementary compiler/browser benchmarks, the loopback Repository journey and
Docker delivery journey retain separate sealed JSON/HTML artifacts under
`artifacts/performance/supplementary/`. They preserve completed measurements and
failed stages without overwriting prior runs. They never grant capability
coverage and are not an exhaustive regression reference. The compiler/browser
runner attempts every group even after one fails. `perf` runs the loopback
Repository benchmark as well as the other supplementary journeys.

`reporting/storage/export.ts` exports self-contained artifact directories to a
shared archive, verifies their seals and exposes a digest suitable for pinning
a reference. It also indexes complete and corrupt historical runs without
overwriting either. Exported directories can be copied into another runner's
history root and read through the same verification path.

Supply `--reference <run-id>` explicitly or set `ULVIA_PERFORMANCE_REFERENCE`
when running `bun run perf`. The internal assessment entrypoint also accepts the
reference after its image-version argument. Its immutable report must
verify and contain complete comparable measurement evidence. Initial over-budget
evidence may remain eligible; shared-host diagnostic evidence cannot. No newest-run promotion or
personal-machine baseline discovery occurs. Missing requested references, changed fixtures,
budgets, inventory, sample counts, instrumentation or machine profiles fail the
comparison. Complete samples and actual invocation witnesses are required for
each obligation. Both timing and work regressions are checked.

Set `ULVIA_PERFORMANCE_DIAGNOSTIC=1` when development checks share the host with
a campaign. Such runs retain full evidence but carry an explicit
`measurement-contaminated` finding. Comparisons reject that marker, failed stack
preparation and changing source trees on either side; a diagnostic report is
never silently promoted to a timing regression reference.

## Initial Assessment Status

On 2026-11-18 the user clarified the scope: performance is required for distinct
Provider execution paths; older contracts sharing those handlers need light
compatibility checks. The historical counts below preserve the earlier, broader
assessment and must not be interpreted as the current performance requirement.

The exhaustive goal was resumed after the focused initialization work. See the
[resumption work log](../../docs/development/performance-resumption-2026-11-17.md)
for the current plan, execution conditions and outstanding gaps. Its counts
distinguish scenario definitions, distinct obligations and measured success.

The 2026-11-17 diagnostic run
`20261117T124020Z-4b12e777358e-69a23911` tested revision
`4b12e777358e302d23d0d6647a6445e5ed3530a6` with a modified test tree.
Its 210 declared scenarios recorded 2,100 measured requests and 210 separate
warm-up requests. Of those scenarios, 208 had complete successful execution
evidence. Two concurrent Repository discovery scenarios failed; budgets produced
42 findings. These counts describe that historical run only.

That run covers 208 of 5,306 mandatory binding/variant obligations across 219
current and 452 retained execution targets. It is an incomplete assessment and
has no regression reference. Mutations, async completion, cold states, large
datasets, history, invalidation, controlled third-party services and retained
release fixtures required expansion under that earlier scope. Current completion
uses the executor performance matrix and the separate compatibility check described
above; historical alias counts are not current performance omissions.

The subsequent diagnostic run `20261117T125402Z-4b12e777358e-15057d8d`
attempted 258 scenarios, including 48 Page lifecycle scenarios. All 48 Page
scenarios had valid business results and persisted-state postconditions. The
two concurrent Repository discovery scenarios still failed; the run recorded
69 budget findings. Its source tree changed while running, so it cannot serve
as a stable regression reference.

The focused secrets run `20261117T130206Z-4b12e777358e-f3139de4`
attempted 52 scenarios, including three process restarts per cold scenario.
Forty obligations had valid invocation evidence, but every scenario was blocked
by namespace cleanup failures. Provider diagnostics showed missing JSON input
on DELETE calls. The independent transport test in
`harness/transport/payload.test.ts` reproduces this without instrumentation:
POST delivers 45 expected bytes; DELETE delivers zero. This application defect
is deliberately left unfixed and the test remains enabled and failing.

## Current 1.0.21 integration

The 2026-11-18 integration adds detailed composition reads, identity reads,
draft updates, permanent deletion and favicon reads/updates. Both HTTP and MCP
receive the ordinary cold/warm/concurrent matrix; readers also prime and mutate
before invalidation measurements. Detailed and identity reads add large Unicode
snapshots and eight draft revisions diverging from an unchanged publication.
These are declared cases, not evidence that their measured execution passed.

Composition fixtures use unique tags and check foreign sessions, cross-instance
visibility, malformed requests, optimistic revisions and replacement identities.
Favicon cases lease independent settings tenants, check unsafe references and
stale revisions, and restore the original reference before releasing the lease.
Only the selected invocation is timed; preparation, refusals and postconditions
remain outside nominal coverage.
