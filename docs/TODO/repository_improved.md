# Repository Upgrade Model Status

Reviewed on 2026-11-04. This replaces the earlier design checklist. The current
contract and mounted administration flows are documented in
[Reviewed Release Upgrades](../architecture/release-upgrades.md).

## Implemented

- Capability/resource deprecation metadata, replacement references and compatible
  identity rules. Sunset dates remain advisory.
- Collection and site usage inventories, including transitive requirements,
  dependent imports and explicitly registered internal consumers. Incomplete
  evidence blocks a breaking switch.
- Exact contract selections and independent site capability grants, checked at
  live invocation as well as during planning.
- Provider manifest/profile retention preflights, including pending transitions.
- Read-only contract and collection plans followed by revision-checked apply and
  resume operations through a shared site write fence.
- Explicit target configuration and text overrides without rewriting Page HTML.
- Durable exact switch intents and recovery, with administration review screens
  and HTTP/MCP bindings to the same domain operations.

The fresh collection format has no resource generations, transformation chains,
collection-owned Pages or legacy reader. Breaking retained resources receive
new IDs; compatible identities coexist until consumers are remediated.

## Remaining Work

- A separate editorial operation for replacing Page-authored Bloc occurrences.
- Administration collection uninstall with complete affected-resource analysis;
  dependency checks alone do not authorize removal.
- Automated cross-process recovery of orphaned normal write permits. Until then,
  inspect ownership and confirm writers have stopped before recovery.
- Broader real-persistence interruption and restoration evidence, and granular
  editorial roles. See [open platform work](../TODO.md).

Do not add migration compatibility layers or infer unused resources from traffic
alone. Future changes must preserve exact artifact identity, complete usage
analysis and explicit operator decisions.
