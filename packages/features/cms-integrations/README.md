# Integration management

Deployment and configuration are separate. Deployment installs declarative
artifacts; management invokes integration-owned functions after installation.
Managed definitions have no installation inputs. The parser accepts an omitted
`inputs` property and normalizes it to an empty array. Legacy input definitions
remain readable for migration and immutable historical package verification.
Undeclared answers are not persisted; the installation runner rejects
undeclared answer fields in its input DTO.

See the [authoring guide](../../../docs/integrations/management.md) for a
manifest example and the complete settings, reference, and Health workflow.

A definition may declare `management.schemaVersion: 1`, a health function,
settings functions, and actions. Every referenced function must be an owned
`POST` function with `access.mode: "system"`. Actions use declared identifiers;
they do not accept an arbitrary URL or script. `extensionOf: {kind}` identifies
an extension's parent and must also reference a declared dependency. A managed
integration can publish functions without publishing a Source artifact.

Settings declare `readFunctionId`, `saveFunctionId`, optional `applyFunctionId`,
and the existing `DashboardField[]` contract. Optional `dashboardId` reuses an
installed settings dashboard. The CMS forwards settings data to the integration,
which owns validation, revisions, persistence, and provider reconciliation.

Control mounts these administrator-protected routes:

- `GET /api/integrations/management/settings?id=<installation>`
- `POST /api/integrations/management/settings?id=<installation>`
- `GET /api/integrations/management/health?id=<installation>&refresh=true`
- `POST /api/integrations/management/action?id=<installation>`

Settings saves normally send `{values, expectedRevision}`. Context dashboards
may send their existing flat data object. Saving invokes the save function and,
when declared, applies the saved revision immediately. Apply performs
`apply-settings`, synchronizes declared runtime bindings, then invokes
`confirm-apply`. The reserved `apply-settings` action retries application.
Other actions send `{actionId, input}` and invoke their declared function.
Settings responses use `{values, savedRevision, appliedRevision}`, with opaque
string or null revisions. Failed application leaves saved settings available
for retry and does not change the installation's deployment status.

Function requests contain `operation`, `installationId`, `definitionVersion`,
`input`, `secretValues`, and `generatedSecretValues`. Mutations include the
verified administrator `actor`; declared actions also include `actionId`.
Declared page-link fields, including list rows, are resolved against published
CMS pages on the server. Trusted page metadata is supplied separately in
`resolvedPages`, keyed by dotted field path. Browser-supplied snapshot metadata
is never used as resolved metadata.

Only exact `${KEY}` values in declared secret-ref fields grant settings access.
Grants are persisted as references, separately from installation-owned generated
secret keys. Function responses cannot write selected user secrets. Settings
grants are filtered against the current manifest before invocation. Retired
settings grants are removed after successful deployment while keys needed by
another declared grant remain available in the vault. Generated writes require
a name in `management.generatedSecrets` and an existing owned
installation secret slot. Generated outputs stay server-side and remain
available for retry after runtime synchronization fails. Installed generated
values are preserved during deployment reruns and upgrades.

`runtimeSecrets` maps environment names to declared settings fields or granted
generated slots. Control delegates synchronization through the installation's
single connector destination and the adapter's optional `syncSecrets` method.
Ordinary deployments persist `connectorRuntimeTargets`; migration-aware
connectors retain their lineage bindings. Legacy ordinary installations can
recover their destination from the latest successful deployment run. The
configured Supabase adapter rejects provider drift and updates only supplied
variables. Provider credentials are not delivered to integration functions.
Deployment preserves runtime variable names owned by installed integrations,
including when another integration shares the provider's project. Obsolete
installation keys remain in the vault while selected settings still grant them.

A health report declares `schemaVersion: 1`, overall status, `checkedAt`,
configuration revisions, and checks. Overall status is one of
`needs_configuration`, `ready`, `degraded`, `blocked`, or `unknown`. Check status
is `ok`, `warning`, `error`, or `unknown`; `actionIds` must reference declared
actions. Reports may include an actual operation with named step statuses.

Declared management actions may reuse `DashboardField[]` through `actions[].fields`.
Core resolves page-link fields only within the selected action's declared scope
and supplies trusted `resolvedPages` alongside `input`. Existing dashboards may
dispatch `{ installationId, action: "action", actionId, body }` through their
management action binding; no extra settings form is required.

The observation envelope distinguishes valid reports, unreachable functions,
invalid reports, and unsupported health capabilities. Freshness is independent
of the integration's status. The last valid report is retained as stale evidence
when a later check fails, including after a settings mutation. Reports retain
their own check timestamp, revisions, and definition version. Checks are cached
for 30 seconds, concurrent checks are deduplicated, and the observer waits at
most 10 seconds. Timeout and authentication failures have safe reason codes.

Mutations use an atomic installation lease with a 60-second expiry and a
20-second heartbeat. Lease ownership is checked before generated-secret writes,
runtime synchronization, and confirmation. Ordinary deployment and migration
claims reject an active management lease. This is mutual exclusion for bounded
management operations; it does not define a general workflow engine. The
integration remains responsible for revision checks and provider idempotency.
