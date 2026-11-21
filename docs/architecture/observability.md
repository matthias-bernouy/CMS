# CMS observability

`ulvia/cms.observability@1.0.0` is a required selection in the official CMS system plan. Providers implementing unrelated contracts need not implement it.

The official Provider composes `CmsObservability` from `@bernouy/observability` with `MongoJournalStore` from `@bernouy/observability/mongo`. Each instance uses its existing private database and an instance-bound service. Core feature code chooses neither environment configuration nor network adapters.

## Contract

- `logs.append` receives 1–50 structured entries and acknowledges only persisted records. It is a naturally idempotent command: IDs survive retries; conflicting ID reuse is rejected.
- `logs.query` filters in storage and returns up to 200 summaries, a filter-bound signed cursor and the resolved time window. Defaults: 100 records, previous 24 hours. Windows cannot exceed 31 days.
- `logs.get` reads one retained entry with bounded attributes and sanitized error details.
- `logs.aggregate` counts retained records by one predefined dimension. It returns at most 50 groups and explicitly reports truncation. These are journal counts, not request rates or latency metrics.

Attributes are bounded string tags. Existing nested local diagnostic values are serialized into bounded strings before transfer; this version does not expose an arbitrary recursive JSON attribute schema.

Time windows use occurrence time by default; `timeField: "receivedAt"` explicitly filters by server reception time. Filters include time, exact levels or minimum level, service, component, event or literal event prefix, HTTP request ID, invocation ID, contract ID and capability ID. Unknown fields and unbounded filters are rejected. Cursors expire after 15 minutes and cannot move between instances or filter sets. Pagination orders by reception time and UUID, and does not promise a transactional snapshot while entries arrive or expire.

## Authority

Instance and emitter identity are not ingestion input. The instance service is constructed by the runtime; the emitter is supplied through verified invocation claims. The Edge requests a short-lived source-bound token through the selected Installations contract. Only the actual control authentication boundary can request this identity; ordinary administrator invocations cannot impersonate the Edge.

The Edge system identity can append diagnostic records and retains its established Content delivery queries. It cannot query or administer the journal. Browser reads use the ordinary administrator authorization path. Local CLI operators may read the named instance using its private control connection, which issues scoped invocation tokens; that control Bearer never reaches a selected capability Provider.

Third-party Providers use a separate return credential and an explicit approved
`requires` for `logs.append`, through the [generic Provider SDK](../providers/connections.md).
The receiver derives `provider:<source-installation-id>` from signed provenance.
Stored IDs are emitter-scoped and `sourceEntryId` preserves the producer UUID.
Append authority does not imply journal read or administration authority.

Host-wide Provider and global Repository diagnostics remain operator-owned stdout/stderr records. They are not copied into hosted site journals.

## Operator federation

`ulvia/cluster.logs@1.0.0` is a separate host-only read contract. It is excluded
from ordinary and Control CMS plans, their execution reports and selection
mutations. Exact registration is accepted only in the isolated `cluster-logs`
runtime. Tenant administrator, control and delegation credentials cannot invoke
its routes. The existing `ULVIA_PROVIDER_OPERATOR_TOKEN` authenticates these
static `QUERY` bindings on the Provider listener:

- `/ulvia/operator/logs/query` (`logs.query`)
- `/ulvia/operator/logs/get` (`logs.get`)
- `/ulvia/operator/logs/aggregate` (`logs.aggregate`)
- `/ulvia/operator/logs/latency` (`latency.query`)

`GET /ulvia/report` with that operator credential returns only the isolated
`instance:cluster-logs` account and its exact Cluster Logs implementation.
Tenant credentials retain their own instance report without this contract;
the operator credential grants neither a tenant control lease nor CMS execution.

This version has HTTP bindings only; it is not exposed through tenant `/.cms/mcp`.
Discover IDs using the existing bounded operator instance catalogue. Each request
selects 1–16 distinct instances; larger deployments require explicit batches.
Every source is resolved freshly through the host registry. Instances with the
exact supported Observability release can be read even when disabled or failed,
so operators can diagnose their retained history. The runtime opens their
existing Mongo collections without hydrating CMS runtimes, creating indexes,
altering records or copying journals. Missing instances and unsupported releases
are reported as unavailable/unsupported sources.

The service admits at most four concurrent operator HTTP requests, each with at
most four concurrent source reads. Each database operation has a two-second
execution deadline. A query reads at most `limit + 1` projected summaries per
source (limit at most 200), then merges by descending reception time, entry ID
and instance ID. Signed host/filter/selection-bound cursors expire after 15
minutes. A failed source stays excluded through that cursor traversal; restart
the query to retry it. Results are not transactional snapshots. Partial source
coverage is explicit on every response, including empty and get responses.

Group counts are calculated in Mongo, with at most 500 source groups. The global
top 50 is selected after merging complete successful source groups. A source
exceeding its group/point budget is explicitly excluded, not silently truncated.

Latency queries require one exact event and service so unlike measurement
boundaries cannot be mixed accidentally. Mongo constructs bounded logarithmic
histograms from retained numeric `durationMs`, grouped by UTC interval and
capability identity, instance or service. Histograms merge before percentile
calculation. Results name `histogram-upper-bound-v1`, with 10% relative bucket
width above 1 ms and a first bucket covering submillisecond durations. Estimates
are upper bucket bounds clamped to observed extrema; counts, means and extrema
use original durations. Responses contain at most 500 points. Empty windows have
no points. No ingestion, metrics collection, persisted rollup or new telemetry
format is introduced. Coverage and deployment attribution remain limited by
the original journals.


Declared Provider refusals record their stable error code and, when known, a
bounded diagnostic `reason`, such as `page.multiple_h1`. The official surface
recognizes its own reason catalogue and preserves this identifier through
localization and asynchronous execution. Logs do not copy the translated message,
reason parameters or capability inputs. This diagnostic tag is not a contract
field, response header or persisted operation output. Asynchronous failure
observations retain the operation and request identifiers for correlation.

## Collection and persistence

Application calls retain the small `Logger` interface. A shared collector snapshots and redacts records, queues at most 2,000 records / 2 MiB, and sends batches of at most 50 records / approximately 256 KiB once per second. Delivery is single-flight, with bounded exponential backoff and jitter. Permanent rejections discard the rejected batch and report a count to the fallback destination. The delivery path suppresses its own collection to prevent recursion.

The Edge has no persistent local journal. Unacknowledged records can be lost on a crash or queue overflow. Normal shutdown attempts a two-second drain; diagnostics never block a site operation. Known drops and incomplete drains are reported locally. stdout/stderr is available before contract resolution and when collection fails.

The first collection loss emits `observability.delivery.dropped` immediately.
Further losses are summarized at most once per ten seconds during enqueue or
flush, with any remaining summary emitted on close. Each summary includes the
newly lost count and current queue state, and is excluded from collection to
prevent recursion. `collector.stats()` exposes queued entries, bytes, cumulative
drops, consecutive failures, connection and in-flight state, retry time and the
last successful acknowledgement time. A successful operator write is not a
persistence acknowledgement.

All Node loggers share one operator-output queue per process, limited to 1,000
pending entries / 1 MiB of UTF-8 text across stdout and stderr. A destination
that returns `false` receives no further writes until `drain`; the other
destination remains usable. Errors can replace older lower-priority queued
records, and fatal records can also replace queued errors. If the budget still
cannot admit a record, it is dropped. Native stream buffers are separate from
this queue and stop receiving entries at their backpressure signal. Closed
destinations release their queued entries without failing application work.

`nodeLogOutputStats()` from `@bernouy/logging/node` reports queue volume, drops
(including critical drops), blocked/unavailable destinations and destination
failures. Losses produce bounded JSON `logging.output.dropped` summaries at most
once per second when an operator destination can accept them. Reporting timers
do not keep a process alive. If both destinations are unavailable, reports cannot
be delivered. Neither this queue nor the collection queue survives process loss;
durable business audit remains a separate responsibility.

Mongo retains entries for 14 days from reception. Reads exclude expired entries immediately; TTL cleanup removes them asynchronously. Records carry both occurrence and reception dates. Indexed filters, bounded results and database execution deadlines constrain queries.

## Consultation

The three read capabilities also expose MCP bindings authored as
`observability_logs_query`, `observability_logs_get` and
`observability_logs_aggregate`. Discover their emitted names through `tools/list`;
Gateway appends a contract/capability/binding identity hash. They require the same
live administrator authorization and instance scope as HTTP reads. Filters and
pagination remain bounded; `logs.append` has no MCP binding.

No observability Pages are bundled. A client can build a journal view through
these declared capabilities without Mongo or implementation-specific access.

Query the selected instance journal through these HTTP/MCP capabilities.
Use `logs.get` to load a returned entry's sanitized error details. A client
polling for newly received entries can select `timeField: "receivedAt"` and
follow the returned cursor. No instance-journal CLI command or subscription is
provided.

`ulvia logs [--filter component=provider|edge|proxy|mongo] [--filter service=edge-N] [--filter level=error] [--follow]` displays
shared container stdout/stderr for operator diagnosis. A Registry is a logical
instance in the Provider, with its own instance journal. No application journal
files or logging bind mounts are created.

The instance-scoped `ulvia/cms.observability@1.0.0` contract does not implement
exports, alerts, arbitrary full-text searches, distributed spans or performance
percentiles. The separate operator contract computes latency estimates from
existing recorded durations as described above.

Runtime log filters combine different fields with AND and repeated values of the
same field with OR. Levels are exact matches; MongoDB severity letters and Caddy's
warning level are normalized. Unstructured lines remain visible without a level
filter. Each selected container contributes its last 200 lines; at most 64
project-owned containers and 64 KiB per line are accepted. Follow streams do not
hold the installation mutation lock, and cancellation terminates their Docker
clients. These technical reads require neither Control readiness nor CMS login.
