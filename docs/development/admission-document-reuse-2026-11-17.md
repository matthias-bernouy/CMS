# Admission Document Reuse Experiment — 2026-11-17

**Decision: not retained.** This limited experiment shared HTML parsing between
collection SVG-reference and state-binding checks. It reduced parsing operations,
but the real Docker campaign did not demonstrate an end-to-end benefit. The four
modified production files were restored to their pre-experiment contents; the
helper and its two test files were removed from active sources. Earlier
[cold-path improvements](initialization-plan-cold-optimization-2026-11-17.md)
remain intact. No candidate was published or deployed.

## Candidate And Local Evidence

The candidate created one reader inside each `parseCollectionRelease` call and
passed it through the SVG checks for Blocs/examples and the state checks. Only
identical HTML reused a DOM. It preserved validation order, did not cache
validation decisions, and kept normalization/expansion on their existing paths.

Retention was bounded to 256 documents, 4 MiB of UTF-8 source and 50,000 parsed
nodes. These are logical budgets, not a hard JavaScript heap limit. Capacity
overflow used ordinary parsing. Failed parses were retried. The reader never
survived its admission call.

For pinned `ulvia/mossa@1.18.0`, the targeted checks requested 448 documents and
performed 267 parses: 181 fewer, about 40%. Retained input accounted for 594,142
bytes and 13,588 nodes. Tests checked unchanged trees and release data, exact
string identity, separate admission scopes, independent SVG authority/refusals,
entry/byte/node limits, captured limits and failed-parse retries.

A local alternating A/B used the same validators with and without the shared
reader, two warm-up pairs and ten measured pairs. After replacing an allocating
node-budget traversal with a cursor traversal, admission medians were approximately
554 ms without sharing and 520 ms with sharing. The ranges overlapped substantially
(486–577 ms and 509–582 ms). This is warm-VM local CPU evidence, not a production
or process-cold latency guarantee.

## Real-Stack Result

The candidate and reference used identical 52-scenario definitions, pinned
fixtures, instrumentation and Docker resource limits. Mossa cold scenarios
restart the Provider before each invocation; restart time itself is excluded.
Each row below has three measured requests per campaign.

| Mossa client latency | Reference p50 / p95 | Candidate p50 / p95 |
| --- | --- | --- |
| Cold HTTP | 5,205 / 5,789 ms | 5,881 / 6,121 ms |
| Cold MCP | 5,324 / 5,500 ms | 5,596 / 5,810 ms |
| Warm HTTP | 197 / 257 ms | 232 / 241 ms |
| Warm MCP | 268 / 280 ms | 342 / 377 ms |

Cold HTTP still used 235 MongoDB operations and 251 internal requests; cold MCP
still used 244 and 264. These costs were not reduced by this change. The report
flagged nine latency regressions and one work regression, including warm paths
which do not execute the new admission reader. Small samples and changes in
shared work prevent attributing every difference to the cache. They also prevent
claiming that the local CPU improvement made the real request faster.

The candidate recorded 38 passing non-concurrent business scenarios, including
invalidation, and no 502. The 14 concurrent scenarios retained their existing
HTTP 423/MCP `UPGRADE_IN_PROGRESS` refusals. The assessment remained failed with
50 budget findings and eight of ten required obligations covered. The comparison
is incomplete for those 14 concurrent scenarios because their reference samples
are not all successful.

## Preserved Artifacts

- Reference: `artifacts/performance/runs/20261117T170519Z-4b12e777358e-62708888/`.
- Candidate: `artifacts/performance/runs/20261117T174530Z-4b12e777358e-ded35a92/`.
- Rejected patch, measured scripts/logs and decision:
  `artifacts/performance/experiments/admission-document-reuse-2026-11-17/`.

Both report seals were verified through `readRun`. No source changes were detected
during measurement. Candidate source fingerprint:
`048b6440e5f700d983bf1112a61862ccfd8dd29729ae8521eb6accb4c96360ec`.
Both use revision `4b12e777358e302d23d0d6647a6445e5ed3530a6` with a dirty checkout;
the Git revision alone does not identify the measured code. These generated
artifacts remain ignored by Git. The archived patch passes `git apply --check`
against the restored sources; recorded diagnostic scripts preserve their original
workspace paths.

Candidate image version: `0.1.0-admission-docs`.

- Edge: `sha256:f4052d08fea51aab7d912153cc7657a28d5440fe903ffdc8d32af6203bbc05ca`.
- Provider: `sha256:d83afb5080474819f0311783264f8dfb932240ef6684a864975e8cce6d58aef0`.

The profile remained Bun 1.4.4/MongoDB 7.0.37 on a Ryzen 7 6800H, with Provider
two CPUs/2 GiB, Edge one CPU/1 GiB and MongoDB two CPUs/1 GiB.

## Validation And Interpretation

The candidate passed 1,119 Repository/runtime-store tests (six skips, no failures),
the ten static check stages and workspace build. Full `verify` was attempted:
its sandboxed unit stage reported 3,612 passes, 56 skips, 154 failures and one
error, then Docker construction failed on socket access. The separate targeted
tests and Docker campaign used their required local access. Full verification
was not green.

The small scoped optimization was withdrawn rather than adding a production
cache without demonstrated request-level benefit. Restoring the previous code
does not constitute a new latency measurement; the earlier timings remain
historical evidence. The expensive parts of full admission and bundle transfer
remain candidates for separate work.

After withdrawal, workspace `build` and all ten `check` stages passed again.
The archived candidate patch was checked for applicability without applying it.
