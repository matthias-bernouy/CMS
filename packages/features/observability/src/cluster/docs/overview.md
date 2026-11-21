# Cluster Logs

`ulvia/cluster.logs@1.0.0` reads existing journals on one Provider host. Only the
authenticated cluster operator may invoke it; a CMS administrator, instance
control credential, Provider delegation or caller-supplied identity is insufficient.
It collects no new telemetry and does not copy journals into another store.

## Workflow

Discover instance IDs through the operator instance catalogue. Select 1–16 distinct
IDs per request; process larger catalogues in explicit bounded batches.
`logs.query` accepts the existing journal filters and returns existing summaries,
ordered by descending reception time, entry ID and instance ID. Follow `nextCursor`
with the same selection, filters and limit. Cursors expire after 15 minutes and
cannot move between hosts. Queries are not transactional snapshots: retention and
late arrivals may affect later pages. Sources failing during a cursor traversal
remain excluded until a fresh query; inspect coverage on every page.

`logs.get` requires both instance ID and entry ID. It returns the existing detail
DTO, including bounded string attributes. No opaque JSON response is introduced.
An absent entry in an available source refuses with `NOT_FOUND`; an unavailable
source returns a partial response with a null entry.

`logs.aggregate` counts records by one declared dimension, including instance ID.
It returns the top 50 groups and explicitly reports truncation. Log counts are not
request counts, since several records can describe one request.

## Latency

`latency.query` requires one exact `event`, one exact `service`, a grouping and a
60–3600 second interval. Select the actual completion event appropriate to the
measurement. Gateway durations include downstream waiting. Do not combine HTTP,
Gateway and Provider durations or subtract their percentiles.

Only existing numeric `durationMs` values contribute. The service combines
logarithmic histograms across sources before computing P50/P95. `method` is
`histogram-upper-bound-v1`: percentile estimates are upper bucket bounds, clamped
to the observed minimum/maximum. Bucket width is at most 10% above 1 ms; the first
bucket covers durations below 1 ms. Count, mean, minimum and maximum use actual
measurements. Empty windows have no points, not zero-valued percentiles. Counts
always accompany estimates; very small populations are not stable tail estimates.

Windows are bounded to 31 days and at most 500 interval/group points. Narrow the
window, grouping or filters after `QUERY_TOO_LARGE` or a `limit_exceeded` source.
Every response names all requested sources. `partial: true` means totals and
percentiles cover only successful sources; never present them as cluster-wide
complete statistics. Source success does not prove collection coverage, absence of
drops or zero request errors. Unknown source failures expose no private details.

Release comparisons require comparable traffic and existing release identity.
Client latency, isolated network timing and build metadata cannot be invented
when absent from the journals.
