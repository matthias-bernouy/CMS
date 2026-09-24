import type { CapabilityRequirement, ContractRelease } from "cms-contracts/interfaces/ContractRelease";
import type { CatalogueContractRelease } from "cms-contracts/interfaces/ReleaseCatalogue";
import { satisfiesVersionRange } from "cms-contracts/core/compatibility/versionRange";
import { getRequirementSupportRanges } from "cms-contracts/core/compatibility/ranges/support";
import { ReleaseValidationError } from "cms-contracts/core/protocol/errors";

/** Published references remain valid after yanking; installation availability is a separate concern. */
export function verifyRequirements(release: ContractRelease, published: readonly CatalogueContractRelease[]): void {
    const byContract = new Map<string, ContractRelease[]>();
    for (const { admission } of published) {
        const candidates = byContract.get(admission.release.contractId) ?? [];
        candidates.push(admission.release);
        byContract.set(admission.release.contractId, candidates);
    }
    for (const [capabilityIndex, capability] of release.capabilities.entries()) {
        const requirements = capability.requires ?? [];
        const groups = new Map<string, CapabilityRequirement[]>();
        for (const requirement of requirements) {
            const group = groups.get(requirement.contractId) ?? [];
            group.push(requirement);
            groups.set(requirement.contractId, group);
        }
        for (const [contractId, group] of groups) {
            // One selected release must fulfill every edge to this contract for this capability.
            const witnesses = (byContract.get(contractId) ?? []).filter((candidate) =>
                group.every(
                    (requirement) =>
                        satisfiesVersionRange(candidate.version, requirement.versionRange) &&
                        candidate.capabilities.some((target) => target.id === requirement.capabilityId),
                ),
            );
            for (const requirement of group) {
                verifySupportRanges(
                    requirement,
                    witnesses,
                    `$.capabilities[${capabilityIndex}].requires[${requirements.indexOf(requirement)}]`,
                );
            }
        }
    }
}

function verifySupportRanges(
    requirement: CapabilityRequirement,
    witnesses: readonly ContractRelease[],
    path: string,
): void {
    for (const range of getRequirementSupportRanges(requirement)) {
        if (!witnesses.some((candidate) => satisfiesVersionRange(candidate.version, range))) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `no published ${requirement.contractId} release in ${range} jointly exposes all required capabilities`,
                path,
            );
        }
    }
}
