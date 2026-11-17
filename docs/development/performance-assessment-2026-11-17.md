# Capability Performance Assessment — 2026-11-17

This is an interim measurement report, not completion of the exhaustive test
mission. Application implementations and contracts were not corrected. No
production data was used and no commit was created.

## Scope And Provenance

The measured application revision is
`4b12e777358e302d23d0d6647a6445e5ed3530a6`. The test tree contains uncommitted
changes. Every capability report records the working-tree fingerprint, exact
image IDs, fixture digest, instrumentation digest and environment profile.
Reports whose source changed during execution are explicitly ineligible as
stable regression references.

The SDK inventory identifies 219 current and 452 retained exact execution
targets, across 13 current implementations. A target includes the contract
version and digest; retained targets are not additional unique business
functions. Inherited capabilities retain their actual declaring owner. Published
templates without implementations are listed separately.

The initial policy expands these targets into 5,306 mandatory binding/variant
obligations. An obligation is an exact target, binding and required scenario
variant. It is not a coverage percentage based only on endpoint names.

Capability fixtures use real Docker Edge, Gateway, Provider, MongoDB and
authentication. The host is Linux x64, AMD Ryzen 7 6800H, 16 logical CPUs,
29,148,069,888 bytes RAM, Bun 1.4.4 and MongoDB 7.0.37. Capability containers
are limited to Provider 2 CPUs/2 GiB, Edge 1 CPU/1 GiB and MongoDB 2 CPUs/1 GiB.
Test probes and profiling add overhead. These figures are local diagnostic
evidence, not uninstrumented production service-level guarantees.

## Historical Runs

Artifacts are ignored by Git. Each ID below names a directory under
`artifacts/performance/runs/`, with sealed JSON and standalone HTML.

| Run ID | Attempted scenarios | Passed scenarios | Covered obligations | Budget findings |
| --- | ---: | ---: | ---: | ---: |
| `20261117T124020Z-4b12e777358e-69a23911` | 210 | 208 | 208 / 5,306 | 42 |
| `20261117T125402Z-4b12e777358e-15057d8d` | 258 | 256 | 256 / 5,306 | 69 |
| `20261117T133312Z-4b12e777358e-b247b1f5` | 310 | 256 | 296 / 5,306 | 69 |

The first run kept a stable test-tree fingerprint during execution. The next
two changed during execution and cannot be regression references. Their
different fixture and instrumentation fingerprints also prevent treating the
rows as a regression comparison.

All 48 Page lifecycle scenarios in the second run had valid response DTOs and
persisted-state postconditions. They cover creation, reads, updates, renaming,
route/SEO changes, publication and deletion over HTTP and MCP, in nominal,
warm and concurrent variants.

In the third run, 52 secret scenarios were blocked by teardown. Forty had
valid measurement evidence, explaining why covered obligations exceed passed
scenarios. A covered invocation does not erase a failing scenario or grant a
passing overall assessment. Later fixture changes use scoped existing service
ports for teardown, while measured DELETE calls still use the real HTTP path.

The third run's 69 budget findings comprise 65 internal-request ceilings and
four latency ceilings. These are findings per scenario, not 69 distinct
capabilities. Examples include `files.workspace.get.mcp.warm` at 311.24 ms p95
against 250 ms, and `observability.logs.query.mcp.warm` at 354.21 ms p95 against
250 ms. Their maximum internal request counts were 19 and 20 against 15.

## Confirmed Problems And Correction Backlog

Corrections below are future work. The assessment deliberately leaves them
unfixed and retains their failing tests.

1. **P1 — JSON bodies disappear on DELETE through the pinned HTTP transport.**
   `tests/performance/harness/transport/payload.test.ts` independently sends the
   same 45-byte payload through the real public transport without test probes.
   POST delivers all 45 bytes; DELETE delivers zero. Provider diagnostics then
   reject empty JSON input. Measured secret namespace deletion, key revocation
   and secret deletion fail. Current full-verify diagnostics surface HTTP 409
   `outcome_unknown`; status mapping should not obscure the transport failure.
   Reproduce with `bun test tests/performance/harness/transport/payload.test.ts`.
2. **P1 — Repository discovery fails under concurrent valid requests.**
   `installations.repository.search.http.concurrent` returns 503;
   its MCP counterpart reports declared `CORE_UNAVAILABLE`. Both fail across
   the three historical passes. Investigation should separate discovery work,
   admission/selection reads and common gateway overhead, using recorded spans.
3. **P2 — Repeated common-path internal calls exceed diagnostic ceilings.**
   MCP reads frequently require 18–21 internal requests. The reports separate
   handler work from shared routing/authentication work. Profile these paths
   before changing caching or adding capability-specific optimizations. The
   initial ceilings must not be raised simply to make the suite pass.

## Workspace Validation

The initial `bun run check` passed all ten stages. A later full `bun run verify`
completed every acceptance stage: ordinary tests recorded 3,689 passes, 56 skips
and the enabled DELETE reproduction failure. Browser smoke, real delivery and
fresh/restarted TLS journeys passed. Supplementary performance budgets passed.
The capability assessment remained red, including missing coverage/reference
and the failures above. This is historical evidence, not validation of every
subsequent harness edit.

Real delivery completed two 420-request loads, including 105 authenticated
requests each, across three public Pages. Fully consumed responses yielded
200.42 requests/minute without cache and 200.43 with cache. The fixture also
checked freshness after writes and cross-instance refusals. These journeys
provide supplementary evidence and do not substitute for exact capability
invocation witnesses.

The current organization and commands are documented in
[the performance suite](../../tests/performance/README.md). New supplementary
benchmark and delivery executions use immutable sealed JSON/HTML history under
`artifacts/performance/supplementary/`, rather than overwriting `latest.json`
or `optimized.json`.

## Remaining Assessment Work

The mission is still incomplete: missing scenarios are blocking findings in
`verify`, not accepted exceptions. Remaining work includes all unimplemented
test recipes, terminal async completion, controlled SMTP/DNS services, genuine
large datasets and revision history, observable invalidation, and exact retained
release fixtures. Newly declared scenarios must be executed before being
reported as covered.

No complete regression baseline exists yet. Historical reports cannot be
silently promoted or combined to claim exhaustive coverage. A reproducible
reference, source/artifact retention, all mandatory variants and final workspace
verification remain required before closing the assessment.
