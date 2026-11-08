# @bernouy/observability

Instance-scoped diagnostic journals with bounded ingestion, cursor queries,
details, aggregation and redacted structured logging. This is a diagnostic
journal, not a durable business audit.

## Public API

- The package root exports `CmsObservability`, `ObservabilityError`, the
  structural `ObservabilityService` port and schema-derived journal DTOs.
- `./feature` exports the complete `observabilityFeature` and its service ports.
- `./logging` exports the bounded collector and injected logging transport.
- `./memory` is the test adapter; `./mongo` is a runtime composition import.

`src/feature.ts` owns the contract identity/version, four capability definitions,
ordinary Markdown documents and default error classification. Reusable Zod
models live under `src/schemas/`; capabilities own their HTTP/MCP bindings and
execute injected service calls. Build generates the contract and manifest claim.
The Provider selects the complete implementation and injects the service.

The runtime binds the journal to its authenticated instance. Inputs cannot select
an instance or service identity. Ingestion additionally requires trusted machine
context; a browser or untrusted header cannot choose the producer identity.
Administrator reads retain their admitted access and HTTP/MCP declarations.

Journal stores filter, paginate and aggregate. One query requests one bounded
page with at most one extra row for continuation; service code does not load a
whole journal. Cursor integrity binds instance, filters, time bounds and expiry.
Collection and reception redact attributes and errors before durable storage.
