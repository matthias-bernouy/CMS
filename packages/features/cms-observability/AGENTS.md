# @bernouy/cms-observability

Instance-scoped diagnostic journals. This package is not a durable business audit or a metrics backend.

- Bind the service to an authenticated instance in the runtime. Inputs never select a tenant or service identity.
- Query, aggregate, deduplicate and expire in the store; never download a journal for filtering.
- Keep records, queries, output sizes, aggregation buckets and collector queues bounded.
- Redact at collection and reception. Never persist credentials or raw request/response bodies.
- Acknowledge only durable appends. Retries preserve entry IDs and reject conflicting reuse.
- Keep the collector transport injected. It must not import Gateway, HTTP, environment or process adapters.
- Memory is a test adapter. Mongo lives in the explicit ./mongo export.
