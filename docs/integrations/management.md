# Integration-owned settings and Health

Installation deploys capabilities. Configuration changes run through the
integration's own registered functions. Official definitions have zero
installation inputs; omit `inputs` or use `[]`. Use stable Source IDs rather
than asking for an instance alias. Legacy inputs remain readable for historical
verification and migration, not as a new authoring pattern.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Integration | Settings validation, persistence, revision checks, provider reconciliation, truthful Health checks, and recovery actions |
| `@bernouy/cms-integrations` | Manifest validation, function invocation, scoped secret delivery, published-page resolution, mutation leases, and Health observations |
| `@bernouy/cms-control` | Administrator authentication, generic routes, Connection and Health UI, and existing dashboard rendering |
| Runtime and connector adapter | Compose storage and provider adapters; synchronize declared runtime variables to the installed destination |

Core contains no provider-specific provisioning policy. An extension declares
`extensionOf: { "kind": "commerce" }` and a matching dependency with its supported
version range. It may register management functions without a Source artifact.

## Declare capabilities

The following is a definition fragment. Every referenced function must also be
an owned `function` artifact with method `POST` and `access.mode: "system"`.

```json
{
  "management": {
    "schemaVersion": 1,
    "health": { "functionId": "manageExample" },
    "settings": {
      "readFunctionId": "manageExample",
      "saveFunctionId": "manageExample",
      "applyFunctionId": "manageExample",
      "fields": [
        { "id": "apiKey", "label": "API key", "path": "apiKey", "type": "secret-ref" }
      ]
    },
    "runtimeSecrets": { "EXAMPLE_API_KEY": { "field": "apiKey" } },
    "actions": [{
      "id": "publish-document",
      "label": "Publish document",
      "functionId": "manageExample",
      "fields": [{ "id": "page", "label": "Page", "path": "page", "type": "page-link", "publishedOnly": true }]
    }]
  }
}
```

Settings and action fields reuse `DashboardField` from `@bernouy/cms-dashboards`;
there is no second settings-field language. Set `settings.dashboardId` to reuse
an existing settings dashboard when a flat Connection form is insufficient.
Actions reference declared IDs, never arbitrary URLs or scripts.

## Save, apply, and retry

Control protects all four routes with administrator authentication:

| Method and route | Request |
| --- | --- |
| `GET /api/integrations/management/settings?id=<installation>` | Read integration-owned settings |
| `POST /api/integrations/management/settings?id=<installation>` | `{ "values": { ... }, "expectedRevision": null }` |
| `GET /api/integrations/management/health?id=<installation>` | Optional `refresh=true` bypasses the cached result |
| `POST /api/integrations/management/action?id=<installation>` | `{ "actionId": "publish-document", "input": { ... } }` |

Revisions are opaque strings or `null`, not incrementing Core counters. Normal
settings results contain `values`, `savedRevision`, and `appliedRevision`.
An existing context dashboard may send its flat input object instead.

Save invokes `save-settings`, persists the explicitly selected secret grants,
and, when `applyFunctionId` is declared, immediately invokes `apply-settings`.
Core stores authorized generated outputs, synchronizes `runtimeSecrets`, then
calls the same apply function with `operation: "confirm-apply"` and the saved
revision. The integration confirms its applied revision only after those steps
succeed. The reserved `apply-settings` action retries an incomplete application.
There is no deployment reconfiguration step or separate normal Apply button.

A failed apply keeps saved settings and the last applied revision observable.
It does not turn a successful installation into a failed deployment. Providers
must enforce revision conflicts and idempotent retries themselves. A durable
60-second installation lease, renewed every 20 seconds, excludes concurrent
management mutations and deployment; it is not a transaction across systems.

Install, rerun, and upgrade must preserve runtime business rows. Core preserves
existing owned generated values and protects installed integrations' managed
runtime variable names from deployment bootstrap writes, including deployments
sharing a provider project. Ordinary connector destinations are persisted as
`connectorRuntimeTargets`; migration-aware connectors retain lineage bindings.
Control currently requires one destination for runtime secret synchronization.

## Scoped references and dashboard actions

Function payloads contain `operation`, `installationId`, `definitionVersion`,
`input`, `secretValues`, and `generatedSecretValues`. Mutations carry the verified
administrator `actor`; declared actions also carry `actionId`. Do not accept an
administrator identity from browser-supplied input.

A `secret-ref` stores an exact `${KEY}` reference, never the secret value.
Only current declared settings slots grant access, including dotted paths in
reorderable-list rows. Raw values reach the authenticated server invocation;
the integration must not persist, log, or return them. Missing vault values are
omitted during Health and settings reads so configuration remains repairable;
mutating operations require their selected references to resolve.

Grants and owned generated keys are separate. Only names declared in
`management.generatedSecrets` may produce generated outputs, and each must
already have an owned installation slot. Generated writes are accepted only from
application, not from settings reads, Health, or other actions. `runtimeSecrets`
maps to a settings field or `{ "generated": "slotName" }`. Persisted outputs remain available when
a later runtime synchronization fails. Provider-specific receipts must make
partial persistence and external-resource recovery safe.

Every invocation filters retired grants against the current manifest. Successful
reruns/upgrades prune them; migrations defer permanent pruning until completion
so an abort can restore the source definition. Removing a grant does not delete
a user-selected vault key. Cleanup of obsolete installation-owned keys retains
any key still needed by another currently declared grant.

A `page-link` selects a CMS page path. Core resolves it to published metadata in
`resolvedPages`, keyed by dotted field path, including list rows. Missing or
unpublished pages fail resolution. Parent-field visibility can exclude inactive
groups from page resolution; it does not revoke secret grants. External and
media references are accepted only when the field explicitly allows them and
do not receive a published-page snapshot. Action resolution uses only that
action's declared fields; action fields grant no additional secret access.

Existing dashboard actions dispatch through either of these bindings:

```json
[
  { "management": { "installationId": "example", "action": "save-settings", "body": { "page": "$field.page" } } },
  { "management": { "installationId": "example", "action": "action", "actionId": "publish-document", "body": { "page": "$field.page" } } }
]
```

The UI resolves body expressions and unwraps the returned `values` for dashboard
resource updates. Snapshot URLs or metadata supplied inside `input` do not
replace Core's trusted `resolvedPages` envelope.

## Health report and observation

A Health function must inspect state without deploying, saving settings,
creating provider resources, sending mail, or writing secrets. Core never
performs apply/sync from a Health read. The integration returns this report
shape with a real check timestamp and stable check IDs:

```json
{
  "schemaVersion": 1,
  "status": "needs_configuration",
  "checkedAt": "2026-09-06T12:00:00.000Z",
  "configuration": { "savedRevision": "revision-a", "appliedRevision": null },
  "checks": [{ "id": "configuration", "status": "warning", "code": "settings_not_applied", "actionIds": ["apply-settings"] }]
}
```

Overall status is `needs_configuration`, `ready`, `degraded`, `blocked`, or
`unknown`. Individual checks use `ok`, `warning`, `error`, or `unknown`; optional
`code`, `message`, and declared `actionIds` explain evidence and recovery.
Reports may include an actual operation with `running`, `succeeded`, or `failed`
status and steps with `pending`, `running`,
`succeeded`, or `failed` states. Do not invent progress for an observation.
Health revisions are nonempty strings of at most 200 characters or `null`.

The Core envelope keeps deployment status separate from report status:
`observation` is `valid`, `unreachable`, `invalid_report`, or `unsupported`;
`freshness` is `fresh`, `stale`, or `unavailable`. It carries `observedAt`, the
report or `null`, and optional `reason`, `httpStatus`, and
`reportDefinitionVersion`. Reasons distinguish timeout, unauthorized, forbidden,
unreachable, invalid report, and unsupported capability. A valid report can be
stale; an unreachable provider can retain the last valid report as stale evidence.

Checks use a process-local 30-second cache, deduplicate concurrent requests, and
wait at most 10 seconds by default. Failed checks or settings mutations retain
previous evidence with its original timestamp, revisions, and definition
version. Consumers must show observation freshness alongside integration status.

See the [published package contracts](../../packages/features/cms-integrations/README.md)
and [management types](../../packages/features/cms-integrations/src/interfaces/Integration/management.ts)
for the exact API and invocation types.
