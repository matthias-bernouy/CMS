# Reviewed Release Upgrades

The fresh baseline uses Provider/collection protocols v1 and contract, collection
and instance profile releases 1.0.0. The official Provider manifest is 0.1.0;
its software build is 1.0.0. Published artifacts remain immutable. This change
provides no readers or data conversion for earlier development formats.

## Resource Identity

Blocs, settings, tokens, texts, assets and states keep their IDs while their
public contracts remain compatible. A retained incompatible resource needs a
new ID, including in a major collection release. Patches may update
implementations; compatible extensions require a minor version. Removals and
incompatible collection configuration require a major version.

Resources may declare translated lifecycle metadata:

```json
{
    "deprecation": {
        "reason": "panel.deprecation",
        "replacedBy": "example-panel-v2",
        "sunsetAt": "2027-01-01T00:00:00.000Z"
    }
}
```

Replacement IDs identify an existing resource of the same kind. Cycles reject.
Setting replacements use `bloc-id/setting-id`. Sunset dates are advisory; they
do not disable a resource or authorize its removal. Collection configuration
can instead receive explicit target values during a reviewed major upgrade.

## Inventories And Plans

`collectionUsageInventory` lists imports, exports, theme references, Bloc
contracts and examples. `siteUsageInventory` adds stored
published/draft Pages, local Blocs, system settings, collection configuration,
text overrides and explicitly registered internal consumers. References carry
their location and a `catalogue` or `runtime` scope. Collection examples alone
do not request runtime capability grants.

The runtime supplies authoritative Edge/Provider consumers. Missing consumers,
failed reads or revisions changing during analysis make an inventory incomplete.
Native file/download bindings are resolved against exact selected HTTP routes;
capability requirements include transitive dependencies and inherited contracts.

`ulvia.cms.installations/list-site-usage` returns bounded reference batches. Its
cursor pins the inventory digest and is rejected after the analysed state
changes. This inventory contains reference locations, not Page document bodies.

Collection plans pin source/target release digests, revisions, explicit target
configuration/text overrides, resource changes, capability consumers and
blockers. Contract plans pin the complete selection graph, grants, consumer
revision, dependency revision and source/target served-release evidence.
Plans are `applicable`, `blocked` or `incomplete`. Preparation is read-only,
including admission of temporary Repository artifacts. Only current applicable
plans can be applied; there is no direct unreviewed release-switch capability.

## Applying A Switch

The instance exposes these administration capabilities:

- `plan-collection-upgrade`, `apply-collection-upgrade`,
  `get-collection-upgrade`, `resume-collection-upgrade`.
- `plan-contract-upgrade`, `apply-contract-upgrade`,
  `get-contract-upgrade`, `resume-contract-upgrade`.
- `get-site-upgrade-status` for the shared maintenance state.

HTTP and explicit MCP bindings expose the same domain operations. Apply/resume
commands are durable keyed operations; their operation handles are inspected
through `get-operation`. Collection targets may supply `configurationJson` and
`textOverridesJson`. The collection review screen supports optional target
configuration up to the browser state's 8192-character bound; the API accepts
larger bounded values. Empty configuration input retains current values.

The administration's Provider links review one target merged into the current
graph. The API also accepts the whole `selections` array for coordinated changes
and explicit `grants`. Applying uses the complete reviewed graph.

A shared site write fence drains in-flight content/installation/selection writes,
rechecks the plan and performs one revision-checked replacement. Durable intents
contain exact pins and prepared values, never before/after Page snapshots.
Uncertain commit outcomes keep maintenance active until an exact-state resume
can resolve them. Repeating the same completed request is idempotent; changed
retry targets reject. Routes are synchronized after a collection switch.

The switch does not rewrite, republish or roll back Page documents. Replacing
Page-authored Blocs remains a separate future editorial operation. Site changes
between review and apply invalidate the plan. A collection uninstall is not yet
exposed in administration; dependency checks alone are insufficient for removal.

## Selections, Grants And Actor Rights

Selections choose an exact contract digest and installation. Site grants use
`{ "default": "allow-selected", "denied": [] }` initially. Explicit denials are
independent of actor rights and exact release choices. A plan rejects removing
or denying a capability still required by a runtime consumer.

The Gateway and Provider check current selections and site grants on every
invocation. Revocation also rejects a previously issued invocation token. Actor
access checks still apply; granular roles and the distinct editorial operation
are future work. The installations control selection is protected: ordinary
site contract changes cannot replace the control plane.

## Provider Retention And Recovery

Ordinary manifest reapproval cannot drop exact releases retained by site
selections, profiles or pending contract switches. Unknown retention evidence
fails closed. During an operator-requested instance upgrade, the provisioner may
replace a selected release with an admitted, verified compatible newer release
in the same major. The instance is unavailable to live invocations during this
transition. Replacement authority requires the transition lease, exact target
manifest and owning account/site. It preserves old HTTP bindings, rejects changed
access/behavior or incompatible schemas, and never supersedes a pending contract
switch. Retention revisions and the lease are checked again before approval.
The subsequent durable step updates the exact site selections; Pages and
collection requirements are unchanged. Ordinary approval has no such authority.
The Provider checks all managed instance pins, including disabled instances,
and both profiles of queued/running/retryable failed transitions before startup.
The CLI runs a one-shot `checkRetention.ts` preflight in the candidate Provider
image before replacing the live image; startup repeats the guard. The public
Repository does not track sites outside this Provider's administrative scope.

The profile registry retains exact published profiles while instances or transitions
still reference them. The current `ulvia.official@1.2.0` profile selects Provider
manifest `0.3.0`, Installations `1.1.0` and Observability `1.1.0`, and explicitly permits upgrades from
profiles `1.0.0` and `1.1.0`. It retains the same administration collection and existing Pages.
New instances use the configured default; an image update never silently changes
an existing profile pin.

Expired worker leases can be reclaimed for an exact intent. Normal write permits
are not erased merely because their heartbeat expired: a delayed writer may
still commit. A permit left by a dead process therefore requires operator
inspection after confirming that every corresponding writer has stopped. An
automated cross-process recovery protocol for orphaned write permits is not
implemented. Preserve the database when investigating an unresolved operation.
