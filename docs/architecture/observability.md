# CMS observability

`ulvia.cms.observability@1.0.0` is a required selection in the official CMS instance profile. Providers implementing unrelated contracts need not implement it.

The official Provider composes `CmsObservability` from `@bernouy/cms-observability` with `MongoJournalStore` from `@bernouy/cms-observability/mongo`. Each instance uses its existing private database and an instance-bound service. Core feature code chooses neither environment configuration nor network adapters.

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

## Collection and persistence

Application calls retain the small `Logger` interface. A shared collector snapshots and redacts records, queues at most 2,000 records / 2 MiB, and sends batches of at most 50 records / approximately 256 KiB once per second. Delivery is single-flight, with bounded exponential backoff and jitter. Permanent rejections discard the rejected batch and report a count to the fallback destination. The delivery path suppresses its own collection to prevent recursion.

The Edge has no persistent local journal. Unacknowledged records can be lost on a crash or queue overflow. Normal shutdown attempts a two-second drain; diagnostics never block a site operation. Known drops and incomplete drains are reported locally. stdout/stderr is available before contract resolution and when collection fails.

Mongo retains entries for 14 days from reception. Reads exclude expired entries immediately; TTL cleanup removes them asynchronously. Records carry both occurrence and reception dates. Indexed filters, bounded results and database execution deadlines constrain queries.

## Consultation

The official collection provides `/admin/observability` and `/admin/observability/detail`. Both use declared contract capabilities and existing collection bindings. They have no Mongo or implementation-specific client.

`ulvia instance logs <name> [edge | provider] [--level warn] [--event page.render.failed] [--request-id <uuid>] [--json] [--stack]` queries the selected journal. `--stack` loads details only for returned entries. The CLI uses reception-time windows so producer clock skew cannot defer a record behind an already seen page. `--follow` polls the recent result window and walks new pages until a known entry is reached. It stops explicitly if more than 2,000 entries need catching up between polls; it is not a durable subscription.

`ulvia services logs [provider | repository | mongo | proxy] [--follow]` displays container stdout/stderr for operator diagnosis. No application journal files or logging bind mounts are created.

Exports, alerts, arbitrary full-text searches, distributed spans and performance percentiles are not implemented by this version.
