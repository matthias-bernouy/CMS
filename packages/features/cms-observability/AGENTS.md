# @bernouy/cms-observability

Instance-scoped diagnostic journals. This package is not a durable business audit or a metrics backend.

- Bind the service to an authenticated instance in the runtime. Inputs never select a tenant or service identity.
- Query, aggregate, deduplicate and expire in the store; never download a journal for filtering.
- Keep records, queries, output sizes, aggregation buckets and collector queues bounded.
- Redact at collection and reception. Never persist credentials or raw request/response bodies.
- Acknowledge only durable appends. Retries preserve entry IDs and reject conflicting reuse.
- Keep the collector transport injected. It must not import Gateway, HTTP, environment or process adapters.
- Memory is a test adapter. Mongo lives in the explicit ./mongo export.

- `./feature` owns all four capability descriptors, default execution, domain
  error mapping, Zod schemas and Markdown documents. Generate the contract from
  this feature; do not add a surface registrar or duplicate API definitions.
- Public entry/detail/summary/query/group DTOs derive from shared schemas. Keep
  stored journal metadata and normalized persistence queries separate.
- Keep the ingestion machine-context guard in its executor before append. The
  Provider supplies trusted identities and HTTP/MCP authorization; no client
  input or header can select another instance or service.
