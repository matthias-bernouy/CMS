import { satisfiesVersionRange } from "@bernouy/ulvia-providers";
import type { ProviderCapabilityRequirement } from "@bernouy/ulvia-providers";
import type { SystemInstallationPlan } from "@bernouy/ulvia-provider";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import type { LoadedSystemArtifacts } from "../artifacts";

/** Retain enabled families and close mandatory dependencies over exact shipped implementations. */
export function systemUpgradePlan(
    source: SystemInstallationPlan,
    artifacts: LoadedSystemArtifacts,
): SystemInstallationPlan {
    const enabled = new Set(source.contracts.map(({ contractId }) => contractId));
    const selected = new Set(enabled);
    const candidates = artifacts.contracts.filter(
        ({ release }) =>
            !["ulvia/cluster.logs", "ulvia/provider.routing", "ulvia/provider.tls"].includes(release.contractId) &&
            (enabled.has(release.contractId) ||
                !["ulvia/repository", "ulvia/cms.hosting"].includes(release.contractId)),
    );
    const pending = [...artifacts.manifest.requires];
    const expanded = new Set<string>();
    const expand = () => {
        for (const claim of artifacts.manifest.implementations) {
            if (selected.has(claim.contractId) && !expanded.has(claim.contractId)) {
                expanded.add(claim.contractId);
                pending.push(...claim.requires);
            }
        }
    };
    expand();
    for (let index = 0; index < pending.length; index++) {
        const requirement = pending[index]!;
        if (
            requirement.optional ||
            candidates.some((contract) => selected.has(contract.release.contractId) && covers(contract, requirement))
        ) {
            continue;
        }
        const matches = candidates.filter((contract) => covers(contract, requirement));
        if (matches.length !== 1) {
            throw new Error(
                `System dependency is unavailable or ambiguous: ${requirement.contractId}:${requirement.capabilityId}`,
            );
        }
        selected.add(matches[0]!.release.contractId);
        expand();
    }
    return {
        ...artifacts.plan,
        contracts: artifacts.plan.contracts.filter(({ contractId }) => selected.has(contractId)),
    };
}
function covers(contract: ResolvedContract, requirement: ProviderCapabilityRequirement) {
    return (
        contract.lineage.some(
            ({ release }) =>
                release.contractId === requirement.contractId &&
                satisfiesVersionRange(release.version, requirement.versionRange),
        ) && contract.capabilities.some(({ definition }) => definition.id === requirement.capabilityId)
    );
}
