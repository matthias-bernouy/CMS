# Stable Capability Lifecycle

A stable `(contractId, capabilityId)` is a durable consumer contract. Publication
checks both SemVer within a major and capability identity across majors. The same
gate applies to official and third-party publishers, memory/Mongo catalogues and
planned publication sets used by repository imports.

## Evolution

Compatible additions may retain an identity. A named input or output field cannot
disappear, including optional fields nested in objects, arrays or maps. Changes
to access, behavior, idempotency, sensitivity, response effects or declared errors
that break the existing contract require a new capability. Existing HTTP routes,
parameter mappings, codecs and response contracts remain executable; additional
bindings may be introduced. Changing an exact parent compares effective inherited
capabilities rather than only the child's authored additions.

Adding an error `output` schema, including a required `message`, is a compatible
minor change. Further additive detail fields follow the same recursive projection
rules as successful outputs. Execution projects details to the selected release:
an older release with no error output keeps its code without the new details.
Declared detail fields cannot disappear or change incompatibly. Error codes,
retryability and existing HTTP error statuses retain their identity guarantees.
Editing an error description alone is an editorial patch change.

A breaking implementation uses a new capability ID and a distinct HTTP binding.
The transition release retains the original and declares its replacement:

```json
{
    "deprecation": {
        "reason": "Use the resource operation with common HTTP context.",
        "replacedBy": "delivery.resolve-resource"
    }
}
```

Replacement references may name inherited capabilities and cannot form cycles.
For specializations, publication and exact lineage resolution complete the
reference validation that standalone parsing cannot perform. Sunset timestamps
remain advisory. Removing a capability requires a higher major than its preceding
stable release and a deprecation in that already-published stable release. For a
migration, the replacement must exist in both the transition and removal releases.
Withdrawal without a successor must instead declare
`deprecation: { retirement: true, reason: "..." }` in the transition release.
Retirement requires a nonblank reason and cannot include `replacedBy`. A prerelease
alone is not evidence of a published stable transition. An identifier absent from
the preceding stable release but present earlier cannot be recycled. Maintaining
an older major remains possible without treating a newer major's removal as a
removal from that older line.

Backports also compare shared identities with already-published stable releases
above their version, in SemVer order. Publishing an older maintained line cannot
introduce an incompatible definition of an identity already stable in a newer line.

New capability identities may evolve while they exist only in previews. A preview
cannot break an already-stable identity. Historical artifacts and exact republishes
remain immutable. Trusted restoration of verified, already-stored history does
not re-publish that history under a new policy; new publications are checked
against the preceding known stable baseline.

These identity guarantees also apply to 0.x releases without a prerelease suffix.
Experimental identity changes use explicit prereleases; a minor 0.x increment
does not waive the catalogue's deprecation and removal policy.

`compareContractReleases` reports directional schema/SemVer compatibility between
two releases. It does not by itself prove a complete publication lifecycle. The
catalogue additionally checks stable identity, retirement and known history.
These structural checks cannot prove that an implementation preserves the meaning
of a behavior hidden behind the same schema.

## Site And Collection Upgrades

Deprecation does not disable a selected capability. A site can move to the
transition release and continue using its old calls. A later removal is blocked
while runtime inventories still contain an explicit reference to that capability.
Plans report concrete locations, require complete inventories and check source
and target availability, grants, exact digests and revisions before committing.

A host adapter can declare explicit supported alternatives in its usage evidence.
Such alternatives must be implementation evidence supplied by the host.
The official Edge baseline requires `delivery.resolve-resource` and declares no alternative. It is never inferred from `replacedBy` and is not
an authored collection requirement or permission to redirect an existing call.
The chosen alternative still requires its execution grant.

An updated collection may change a Bloc's internal call while preserving the
Bloc's identifier, settings, slots and public behavior. Its Page references then
remain unchanged. Calls written directly in Page documents remain explicit
usages and need their own authoring change. Upgrades never delete or rewrite Pages.

Collection SemVer and contract SemVer are independent. A collection dependency
such as `^1.0.0` still excludes contract 2.0.0 even if its capability remains
present. A verified compatible collection release can widen that range. The
safe order is: select the transition contract, install consumers using the new
capability, then select a removal major accepted by their declared ranges.

The official development baseline starts at 1.0.0 with only
`delivery.resolve-resource`. It contains no authored capability deprecation or
retained profile from the preceding development iterations. Future changes use
the lifecycle above; a clean baseline does not weaken immutable publication.

## External Sources

Any third-party release published into this catalogue follows the same known
history checks. A standalone admitted artifact, or the first imported version of
a contract without its predecessors, cannot prove that an unknown publisher's
past transitions followed this policy. It establishes only the known baseline.
Later publications are checked against the available history.

An independent external API does not acquire this lifecycle policy automatically.
A Provider adapter owns compatibility between that API and its admitted contract.
No external release or service is implicitly migrated by publishing a CMS release.
