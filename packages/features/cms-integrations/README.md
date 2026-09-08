# Integration lifecycle and Health

Integration settings are ordinary integration-owned Source endpoints and dashboard
views. Core supplies native forms, scoped secret/page resolution and infrastructure
operations; the integration owns persistence, revisions, provider reconciliation
and recovery. There is no `management.settings` contract or generated settings UI.

See the [authoring guide](../../../docs/integrations/management.md) for the Source
`integrationContext` contract, reference fields, host completion, failure boundaries
and Health reports.

Definitions may declare `management.schemaVersion: 1`, a Health function, explicit
maintenance actions, generated-secret grants and runtime environment mappings.
Referenced functions must be owned system POST functions. New managed integrations
have zero installation inputs. An extension identifies its parent with
`extensionOf: {kind}` and declares the matching dependency.

Control exposes administrator-protected Health and action routes:

- `GET /api/integrations/management/health?id=<installation>&refresh=true`
- `POST /api/integrations/management/action?id=<installation>` with `{actionId, input}`

Management function payloads contain the operation, installation/version, verified
actor, input and scoped resolved references. Health is read-only and tolerates
missing selected secrets to keep configuration diagnosable. Mutation leases fence
concurrent changes and deployment; integrations enforce their own revision checks
and provider idempotency.

Secret fields live in installed views. The browser submits an exact `${KEY}`
reference. An admin Source endpoint that requests `integrationContext` receives
server-resolved values and published-page snapshots in `_cms`. The integration
completes persistence and provider reconciliation in that single call. After a
successful response, Core retains references, stores granted generated outputs and
synchronizes declared runtime variables. Core never reinvokes the endpoint, strips
private outputs and redacts secret values from the public result.

Health observations keep deployment status, service status and freshness separate.
The last valid report remains available as stale evidence after a failed check.
Caller-scoped reads are cached for 30 seconds and time out after 10 seconds by
default. The global Health workspace has no settings destination; settings and
connection recovery belong to the integration's own views in Sources.
