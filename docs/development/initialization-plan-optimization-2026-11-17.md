# Initialization Plan Optimization — 2026-11-17

This local assessment covers `ulvia/cms.installations:initialization.plan` through
the real Edge, Provider and MongoDB stack, using HTTP and MCP. It does not certify
a deployed site. No public contract, timeout or concurrency policy was changed.

## Result And Evidence

The pinned `ulvia/mossa@1.18.0` fixture contains 107 Blocs, 117 examples,
21 administration Pages and 58 assets. Its release digest is
`sha256:c9e14a512f09aa4f680ff4447cb5253040533d9e17c3756738696089535de41a`.
See the [initial measurements](initialization-plan-performance-2026-11-17.md)
for fixture provenance and baseline limitations.

| Mossa scenario | Before p50 / p95 | After p50 / p95 |
| --- | --- | --- |
| Warm HTTP | 6,919 / 7,053 ms | 196 / 218 ms |
| Warm MCP | 7,289 / 7,416 ms | 248 / 281 ms |
| Cold HTTP | 12,040 / 15,542 ms | 6,132 / 10,270 ms |
| Cold MCP | 11,979 / 12,784 ms | 6,326 / 6,331 ms |

Each row has three measured requests; these are small-sample observations,
not production tail-latency guarantees. The before/after cold HTTP row includes
one invalid 502 response in the baseline and is not a complete successful-sample
comparison. All three candidate cold HTTP requests succeeded. The first nominal
HTTP request in the candidate took 12,489 ms; later nominal requests took about
400 ms. A cold first use is still above the one-second target.

Warm HTTP work fell from 313 to 47 MongoDB operations, 432 to 42 examined
documents, and 254 to 13 internal requests per measured invocation. Internal
response bytes fell from 13,345,518 to 3,655,356; these are instrumented hop bytes,
not unique payload or bandwidth. Remaining shared routing and authority work
still moves several megabytes. Warm MCP retained 56 MongoDB operations and
20 internal requests. These costs remain visible in the report.

The comparable 14-scenario run uses the same fixture inventory, instrumentation
and resource profile as its baseline. The global comparison is incomplete because
four baseline scenarios lack complete valid samples; ten scenario comparisons,
including both warm rows, have complete samples.

| Run | Local artifact directory |
| --- | --- |
| Baseline, 14 scenarios | `artifacts/performance/runs/20261117T151407Z-4b12e777358e-53f8056b/` |
| Candidate comparison, 14 scenarios | `artifacts/performance/runs/20261117T160307Z-4b12e777358e-b1df641e/` |
| Candidate regression campaign, 52 scenarios | `artifacts/performance/runs/20261117T161228Z-4b12e777358e-b0ee32ba/` |

Each directory contains sealed `results.json`, `comparison.json`, `report.html`
and `complete.json`. All three seals were checked with `readRun`. Artifacts remain
ignored by Git. Both candidate runs used source fingerprint
`41a65568bdf718b303e1227860eb48c9996e7c871d9225796c734c8114cb91f3`;
neither observed source changes during measurement. The checkout was dirty, so
the Git revision alone does not identify these changes.

Both candidates used `0.1.0-initialization-cached` images:

- Edge: `sha256:516cc33bfb8de341b0ab424d2c999fd154aac8873d8248abbb9bb0103200d290`.
- Provider: `sha256:9ea50dbae166f8c8e2bfa68405a32af1ce2ad01a0e08825be7602b4ff5b57a54`.

The Provider had two CPUs and 2 GiB, Edge one CPU and 1 GiB, and MongoDB two CPUs
and 1 GiB. The host used Bun 1.4.4, MongoDB 7.0.37 and a Ryzen 7 6800H.

## What Changed

Exact collection pins use a fresh, scoped Repository history query. Full catalogue
enumeration is deferred until ordinary dependency version selection needs it.
An already verified manifest is passed to bundle loading, avoiding its second
download and admission within the same preparation.

Request-scoped evidence reuses only immutable verifier outputs, keyed by object
identity, exact digest and normalized limits. Untrusted or copied DTOs still pass
full admission. Asset bytes are snapshotted and their declaration set, size,
digest and media checks still run. The runtime worker supports asset-only checks
so this work stays outside the Provider event loop. Successful resource-isolation
checks are reused only for the same verified graph, including duplicate detection.

Each initialization service retains immutable artifacts in an LRU cache bounded
to four releases and 8 MiB of canonical metadata plus declared asset bytes. This
is a logical payload budget; JavaScript object overhead is additional. A verifier
policy change clears retained evidence. Oversized material is verified normally
without retention. The existing exclusive service operation prevents concurrent
loads within the same service; worker queue and byte bounds remain unchanged.

At most two successful validated plans are retained, each at most 256 KiB, with
a total 512 KiB limit. Their key includes instance/site identity, initialization
revision, normalized root and locale, exact dependency digests, system/collection/
site-Bloc revisions, current execution fingerprint and verifier generation.
Missing site-Bloc revision evidence disables plan reuse. Artifact eviction makes
dependent cached plans unusable.

Publication availability, empty-site state, route availability and execution
authority are read afresh. State and authority are checked again after preparation.
The runtime fingerprint includes selections, grants, denied capabilities,
installation identity/configuration/approvals and current readiness. No actor,
review or authorization decision is cached. Every request produces a new
actor-bound review. Failed previews are retried, cancellation is honored and
durable installation retains ordinary verification and revision fencing.

## Validation And Remaining Limits

The 52-scenario Docker campaign exercised empty, one-, 25- and 100-Page recipes,
dependency graphs, assets, settings invalidation, Mossa and its 0/1/21-Page
controls through HTTP and MCP. All 38 scenarios outside concurrency passed their
business assertions, including both invalidation scenarios. There were no 502s.
The 14 concurrent scenarios still refuse nine of ten simultaneous requests with
HTTP 423 or MCP `UPGRADE_IN_PROGRESS`; the exclusive-operation policy is unchanged.
Their short refusal latency must not be reported as successful plan latency.

The full report remains failed: concurrent obligations are uncovered and 52
budget findings remain, including cold latency and shared transport costs. Eight
of ten required obligations are covered. No reference was supplied for the full
52-scenario inventory; it is an assessment, not a complete regression comparison.
The independent full campaign reproduced warm Mossa p95 of 220 ms over HTTP and
287 ms over MCP, with cold medians of 6.40 and 6.45 seconds respectively.

Focused repository and runtime regressions passed: 454 tests across 70 files,
1,447 assertions. New tests cover immutable evidence, tampering, exact asset
sets, byte snapshots, cancellation, capacity release, cache eviction and byte
bounds, verifier changes, withdrawn publication, execution revocation, settings
and Bloc revision changes, concurrent Page creation and failed-preview retries.
They live beside initialization execution tests under
`packages/features/repository/tests/collections/admission/examples/bootstraps/execution/`
and worker tests under
`packages/runtimes/ulvia-provider-server/tests/stores/verification/assets.test.ts`.

Workspace `check`, project-reference TypeScript checking and the performance
TypeScript project passed. The service (188 lines) and HTTP source (183 lines)
now exceed the 180-line review guideline. They retain cohesive operation and
transport responsibilities; no mechanical split was introduced. Directory
fanout has no blocking finding. Full `verify` was attempted but is not green: its
sandboxed unit stage reported 154 failures and one error, and Docker image
construction then failed because that process could not access the Docker socket.
The separate targeted Docker campaigns above ran with the required local access;
they do not certify the remaining browser, delivery and TLS verification stages.

The API remains synchronous. Warm reuse meets the subsecond target on this bench.
Cold admission still validates the large manifest, asset declarations and an
ordinary disposable Content preview; observed metadata admission and Page updates
remain substantial. These measurements do not justify claiming subsecond cold
execution or production resolution before deployment and measurement there.
