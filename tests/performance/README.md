# Capability Performance Assessment

The inventory, scenarios, instrumentation and reports live here. Application
handlers, runtimes and contract definitions must remain unchanged during the
initial assessment. Test fixtures mutate disposable local instances only.

## Execution

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

`bun run verify` typechecks this tree, preserves the supplementary compiler and
browser benchmarks, builds candidate images once, and runs the real delivery,
capability and TLS journeys. A failed performance journey remains blocking but
does not prevent later acceptance journeys from running. Failed build
prerequisites still stop dependent stages.

For focused harness development, the internal capability runner accepts an
already built candidate version and an optional history reference ID:

```sh
bun run tests/performance/assessment/run.ts 0.1.0-capability-assessment
bun test tests/performance
bun x tsc --project tests/performance/tsconfig.json
```

The candidate must have current HEAD revision labels and the correct component
and API labels. Docker, MongoDB and Chromium are mandatory. The test client
rejects non-loopback origins. No production credentials are used.

## Coverage And Metrics

`capabilities/inventory.ts` compiles the SDK's exact current and retained
implementation views, including inheritance. Published templates without an
implementation are reported separately. Each release digest, capability,
binding and mandatory variant has its own obligation.

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

Supplementary compiler/browser benchmarks, the loopback Repository journey and
Docker delivery journey retain separate sealed JSON/HTML artifacts under
`artifacts/performance/supplementary/`. They preserve completed measurements and
failed stages without overwriting prior runs. They never grant capability
coverage and are not an exhaustive regression reference. The compiler/browser
runner attempts every group even after one fails. `verify` runs the loopback
Repository benchmark as well as the other journeys.

`reporting/storage/export.ts` exports self-contained artifact directories to a
shared archive, verifies their seals and exposes a digest suitable for pinning
a reference. It also indexes complete and corrupt historical runs without
overwriting either. Exported directories can be copied into another runner's
history root and read through the same verification path.

Supply a reference ID explicitly through the internal runner's second argument
or `ULVIA_PERFORMANCE_REFERENCE` when running `verify`. No newest-run promotion or
personal-machine baseline discovery occurs. Missing references, changed fixtures,
budgets, inventory, sample counts, instrumentation or machine profiles fail the
comparison. Complete samples and actual invocation witnesses are required for
each obligation. Both timing and work regressions are checked.

## Initial Assessment Status

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
release fixtures still require expansion. The active assessment must not be
declared finished while those tests or fixtures are missing.

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
