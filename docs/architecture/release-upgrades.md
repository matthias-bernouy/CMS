# Reviewed Release Upgrades

Provider and collection protocols remain v1. Artifact versions, software image
versions are independent; exact current pins live
in SDK definitions, generated manifests and persisted system installation plans. Published artifacts
remain immutable. Removed development formats have no reader or automatic data
conversion.

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

`ulvia/cms.installations/list-site-usage` returns bounded reference batches. Its
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
`textOverridesJson`. Target configuration is bounded by the admitted API schema.
No collection review UI is bundled.

The contract review API accepts the whole `selections` array for coordinated changes
and explicit `grants`. Applying uses the complete reviewed graph.

A shared site write fence drains in-flight content/installation/selection writes,
rechecks the plan and performs one revision-checked replacement. Durable intents
contain exact pins and prepared values, never before/after Page snapshots.
Uncertain commit outcomes keep maintenance active until an exact-state resume
can resolve them. Repeating the same completed request is idempotent; changed
retry targets reject. Collection switches do not claim or synchronize Page routes.

The switch does not rewrite, republish or roll back Page documents. Replacing
Page-authored Blocs remains a separate future editorial operation. Site changes
between review and apply invalidate the plan. A collection uninstall is not yet
exposed by the official Installations contract; dependency checks alone are insufficient for removal.

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
selections, system plans or pending contract switches. Unknown retention evidence
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
against the build's explicit implementation support matrix before startup. Ready
instances load the exact approved manifest, observations, selections and contracts
from their own persistent stores, independently of the bundled installation kit.
The check retains exact plans for unfinished system installations and transitions,
so recovery cannot lose its admitted resources. Ready sites need no original kit.
The CLI runs a one-shot `checkRetention.ts` preflight in the candidate Provider
image before replacing the live image; startup repeats the guard. The public
Repository does not track sites outside this Provider's administrative scope.

System installation pins come from the SDK-generated manifest and bundled snapshot,
loaded lazily for installation operations. Named profiles are removed. Executable
support is generated in
`packages/runtimes/ulvia-provider-server/src/runtime/instances/system/execution/supported-releases.json`.
An image update never silently changes selected release pins. Adding support
requires exact executor linkage and contract tests; SemVer alone grants nothing.

Compatibility evidence recorded on 2026-11-07 also covers the exact published
`cyaxis/ulvia-provider:1.0.11` digests of `cms.authoring`, `cms.content` and
`repository`. Their installed `1.0.0` artifacts differ from the current authored
baseline. The fixture records executable capability signatures from that image:
access, behavior, schemas, tool names and HTTP mappings must remain unchanged.
The explicit retained metadata snapshot now links these verified historical pins
to current SDK executors after comparing their execution signatures. Generated
support includes only those exact verified claims; unlisted old digests refuse. Existing coordinates are never
rewritten or republished. Future artifact changes require new release versions.

Expired worker leases can be reclaimed for an exact intent. Normal write permits
are not erased merely because their heartbeat expired: a delayed writer may
still commit. A permit left by a dead process therefore requires operator
inspection after confirming that every corresponding writer has stopped. An
automated cross-process recovery protocol for orphaned write permits is not
implemented. Preserve the database when investigating an unresolved operation.
