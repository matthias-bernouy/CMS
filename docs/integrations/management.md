# Integration-owned views, references and Health

Installation deploys capabilities. Settings are ordinary integration-owned views
and Source endpoints. There is no `management.settings` contract, generated
settings view, settings HTTP route, or Core-selected save/apply workflow.
Official integrations remain at version `1.0.0` and have no installation inputs.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Integration | Views, defaults, validation, persistence, revisions, provider reconciliation and recovery |
| Core | Native forms and binding, authentication, scoped references, infrastructure effects and installation leases |
| Connector adapter | Synchronize granted environment variables to the installed connector destination |
| Health | Observe services and expose declared maintenance actions, deployment sync and version upgrades |

A view reads through an ordinary endpoint and submits its native form to another
endpoint. Their paths and response formats belong to the integration. A revision
field is optional at the view-contract level; integrations that need optimistic
concurrency declare it explicitly. Core does not impose a settings response shape.

```json
{
  "widget": "w-detail",
  "id": "connection",
  "source": { "endpoint": "getConnection" },
  "save": {
    "endpoint": "saveConnection",
    "label": "Save settings",
    "valuesPath": "values",
    "hiddenFields": [
      { "name": "expectedRevision", "value": "$resource.savedRevision", "type": "string", "empty": "omit" }
    ]
  },
  "main": [{
    "id": "connection", "title": "Connection",
    "fields": [{ "id": "apiKey", "label": "API key", "type": "secret-ref", "path": "values.apiKey", "name": "apiKey" }]
  }]
}
```

Save uses the existing binding contract: submit typed editable values, lock during
submission and the targeted reload, and preserve mounted controls. Independent
operations use their own action forms. Core adds no second rendering engine.

## Server-side references and effects

An ordinary admin POST JSON endpoint can declare `integrationContext: true`.
Control verifies that the endpoint belongs to exactly one installed integration.
It reads reference declarations from that integration's installed dashboard views,
matching the form's source and endpoint. `name` determines the submitted field
path when present; otherwise `path` does. `valuesPath` selects the submitted values.
There is no duplicate settings field schema in the manifest.

The browser sends references such as `${SMTP_PASSWORD}`, never secret values.
The server rejects a client-supplied `_cms` property and adds its own context:

```json
{
  "values": { "apiKey": "${PROVIDER_KEY}" },
  "_cms": {
    "installationId": "example",
    "definitionVersion": "1.0.0",
    "actor": { "id": "verified-admin", "role": "admin" },
    "secretValues": { "apiKey": "server-resolved-value" },
    "generatedSecretValues": {},
    "resolvedPages": {}
  }
}
```

Only declared `secret-ref` fields grant access, including list-row paths. Clearing
a reference or removing a list row revokes that grant without deleting the vault
key. Unrelated forms retain their grants. Current view declarations filter retired
or malformed grants before resolution. Health tolerates missing vault entries so
it can diagnose configuration; mutating endpoints require selected keys to resolve.
Ordinary GET endpoints read the integration's persisted references without needing
raw secret values. Never log, persist or return the resolved secret values.

`page-link` fields resolve to trusted published metadata in `_cms.resolvedPages`,
keyed by submitted dotted path, including list rows. Missing/unpublished pages are
rejected. Field visibility can exclude disabled groups. Explicitly permitted
external/media references do not receive published snapshots. Browser-supplied
snapshot metadata cannot replace the trusted context.

An endpoint may request infrastructure effects in a private response property:

```json
{
  "values": { "apiKey": "${PROVIDER_KEY}" },
  "savedRevision": "integration-owned-revision",
  "_cms": {
    "rememberSecrets": true,
    "generatedSecrets": { "webhookSigning": "new-provider-secret" },
    "syncRuntime": true,
    "continue": { "phase": "acknowledge", "revision": "integration-owned-revision" }
  }
}
```

All effects are optional. `rememberSecrets` retains the validated references for
later operations and Health. Generated output names must be granted in
`management.generatedSecrets` and have an owned installation secret slot.
`management.runtimeSecrets` maps environment names to `{ "field": "apiKey" }`
or `{ "generated": "webhookSigning" }`. Field mappings must name view fields;
non-secret values come from the endpoint result's `values` object. These are
technical grants, not settings orchestration metadata.

After executing requested effects, `continue` invokes the same endpoint with the
original form body and refreshed `_cms` context, adding `_cms.continuation`.
Core does not interpret phase names, revisions, provider state or retry policy.
The integration decides whether another invocation is needed. There are at most
four invocations; continuation objects are limited to 4 KiB. The endpoint output
contract must preserve `_cms` until the server interceptor consumes it. Control
strips this property and redacts resolved/generated secret values before returning
the public result to the browser. Failed responses execute no effects.

Emailer, Mondial Relay and Stripe Connect own their persist/reconcile/acknowledge
sequence in `/connection`. Their separate `/connection/retry` operation resumes
application from the saved revision and is exposed in their Connection view.
Consent publishes through its ordinary policy endpoint using resolved page
snapshots. Commerce retains its business settings endpoints.

## Failure and deployment boundaries

A renewable 60-second installation lease excludes concurrent mutations and
deployment. Losing the lease fences secret writes and synchronization. This is
not a transaction across the integration database, secret store and provider.
Generated values remain available after failed synchronization. Integrations must
persist recovery state and implement idempotent provider operations; a failed
application must not acknowledge the revision as applied.

Install, rerun and upgrade preserve business rows and existing generated secrets.
They protect installed runtime variable names from bootstrap overwrites, including
other deployments to the same project. Ordinary installations retain
`connectorRuntimeTargets`; migration-aware connectors retain lineage bindings.
Control currently requires exactly one installed target for secret synchronization.
The integration-context adapter is mounted on Control's admin Source proxy;
operator/public endpoints cannot opt into it.

## Health

`management` retains `schemaVersion: 1`, optional `health: { functionId }`, explicit
`actions`, and technical generated/runtime secret grants. Referenced functions must
be owned system POST functions. Health exposes no settings destination or implicit
Apply action. Its administrator routes are:

- `GET /api/integrations/management/health?id=<installation>&refresh=true`
- `POST /api/integrations/management/action?id=<installation>` with `{actionId, input}`

`/admin/health` sits between Settings and AI Assistant. It shows aggregate readiness
and independent integration observations, checks, declared actions, deployment sync
and reviewed upgrades. Settings remain in Sources. Logs belong to a future Audit
surface; site-wide checks beyond installed integrations are not implemented yet.

Health functions are read-only. Reports contain `schemaVersion`, `status`,
`checkedAt`, `configuration`, and `checks`. Overall statuses are
`needs_configuration`, `ready`, `degraded`, `blocked`, or `unknown`; check statuses
are `ok`, `warning`, `error`, or `unknown`. Optional check `actionIds` must refer to
explicit declarations. Configuration revisions are opaque strings or null.
Optional operation progress must describe real integration-owned work.

The observation envelope distinguishes `valid`, `unreachable`, `invalid_report`,
and `unsupported`, with `fresh`, `stale`, or `unavailable` evidence. It can retain
an older valid report after a failure. The process-local cache is scoped to caller
identity/role, deduplicates reads, defaults to 30 seconds, and bounds a check to
10 seconds. Installation mutation timestamps invalidate cached observations.
