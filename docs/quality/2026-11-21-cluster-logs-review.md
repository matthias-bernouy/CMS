# Cluster Logs implementation review — 2026-11-21

The implementation is recorded in commit `c22b63b1b` on `codex/cluster-logs`.
The task worktree is stored durably under `Documents/Codex/2026-11-21`.
The main checkout's unrelated documentation edits were preserved.

## Implemented behavior

`ulvia/cluster.logs@1.0.0` exposes `logs.query`, `logs.get`, `logs.aggregate`
and `latency.query` through admitted HTTP bindings on the Provider's operator
surface. It reuses the instance journal DTOs, including their bounded string
attribute map. It adds no collector, journal copy, index initialization or
persisted metrics rollup. The Provider manifest advances to `1.9.0`; existing
contract release digests remain unchanged.

The operator credential's Provider report offers only `instance:cluster-logs`
and the Cluster Logs contract. Ordinary and Control CMS plans omit it. Tenant
registration, persisted execution plans and selection mutations reject it.
Signed CMS identities, delegation and forged identity headers grant no operator
authority. The host constructs the technical scope only after authentication.

Sources resolve through the host registry on each read. Retained journals can
be read after failure or disablement, without hydrating or restarting a tenant.
Missing instances, unsupported exact journal releases and database failures have
explicit coverage statuses; partial totals are never labeled complete.

## Validation evidence

- Starting `bun run check`: 10 checks passed, 0 failed.
- After restoration in the durable worktree, the focused tests passed: 23 tests,
  including operator discovery/refusal, concurrency, cursor isolation, source
  resolution, histogram merging and executable performance-plan coverage.
- Final `bun run verify`: successful, with all 10 static checks passing;
  the general suite reported 4,477 passed, 91 skipped and 0 failed.
- The explicitly enabled browser journeys, 16 Mongo integration tests, shared
  hosting restart journey and fresh/restarted TLS journeys all passed.
- The performance plan validates 238 executors and 1,829 scenarios. The four
  new capabilities have 26 executable scenario definitions. No measured
  performance campaign or throughput claim is included in this change.

The real Mongo federation test reads 100 matched records from two databases
in six global pages: 12 projected find commands, with at most 18 returned
summaries per source read for a requested page size of 17. Its latency and count
queries issue four aggregate commands. It observes no write/index commands
while the reads run and confirms redaction and exclusion of foreign/expired
records. In production, each source also requires one fresh registry lookup.

The weighted latency test combines 99 observations at 10 ms and one at 10,000 ms.
Its global P95 remains between 10 and 11 ms, rather than averaging the two
source percentiles. Cursor tests cover collisions across instances, binary
ordering, host/filter/selection binding, expiry and partial-source traversal.

## Bounds and remaining limits

Requests select 1–16 instances, with four concurrent source operations and four
concurrent operator HTTP requests per process. Database execution deadlines are
two seconds. Query pages contain at most 200 summaries; aggregations have explicit
source/group limits, and latency responses have at most 500 points.

Percentiles use merged logarithmic histograms and expose
`histogram-upper-bound-v1`. Buckets have 10% relative width above 1 ms; the first
bucket covers submillisecond values. Means and extrema use actual observations.
Absent windows have no points. Do not average returned percentiles across
separate selection batches. Collection completeness, client/network latency and
release attribution cannot be inferred when absent from the original journals.

The 163-line `ClusterLogs` facade remains cohesive: its four read operations
share source coverage and query-window rules, while cursors, histogram math and
source scheduling already have separate responsibilities. Its informational
size finding was reviewed and retained. No directory-fanout errors remain.

See [operator architecture](../architecture/observability.md#operator-federation),
[contract definition](../../packages/features/observability/src/cluster/feature.ts)
and [real Mongo test](../../tests/integration/observability/cluster.docker.test.ts).
