import type { CapabilityDefinition, ContractRelease } from "cms-repository/exports/contracts/index";
import type { ContractSelection } from "../../interfaces/ContractSelection";
import type { AuthorityCapability } from "../../interfaces/SelectionAuthority";
import type { ProviderDelegationPolicy } from "cms-repository/providers/manifests/interfaces/ProviderManifest";
import { delegationAllows } from "cms-repository/providers/manifests/core/delegation/delegationAllows";
import { capabilityGranted } from "../grants";
import type { CapabilityGrantPolicy } from "../../interfaces/ContractSelectionStore";

export type AuthorityCandidate = { capability: CapabilityDefinition; entry: AuthorityCapability };
export function authorityCapabilities(
    selection: ContractSelection,
    lineage: readonly ContractRelease[],
): AuthorityCandidate[] {
    return lineage.flatMap((release, index) =>
        release.capabilities.map((capability) => ({
            capability,
            entry: {
                selection,
                contractId: release.contractId,
                version: release.version,
                digest: index === 0 ? selection.digest : lineage[index - 1]!.extends!.digest,
                capabilityId: capability.id,
                effect: capability.behavior.effect,
                sensitive: capability.behavior.sensitive,
                access: capability.access,
            },
        })),
    );
}

/** Connection and selection reviews use the same exact matching and site-denial semantics. */
export function* delegatedPairs(
    policy: ProviderDelegationPolicy | undefined,
    sources: readonly AuthorityCandidate[],
    targets: readonly AuthorityCandidate[],
    grants?: CapabilityGrantPolicy,
) {
    if (!policy) {
        return;
    }
    const allowed = ({ entry }: AuthorityCandidate) =>
        !grants || capabilityGranted(grants, entry.selection.contractId, entry.capabilityId);
    const allowedTargets = targets.filter(allowed);
    for (const source of sources.filter(allowed)) {
        for (const target of allowedTargets) {
            if (delegationAllows(policy, source.capability, target.entry.contractId, target.capability)) {
                yield { source: source.entry, target: target.entry };
            }
        }
    }
}
