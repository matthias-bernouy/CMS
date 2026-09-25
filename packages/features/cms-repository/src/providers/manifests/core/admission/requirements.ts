import type { ContractRelease } from "cms-repository/exports/contracts/index";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { isVersionRangeSubset } from "cms-repository/exports/contracts/compatibility";
import type { ProviderCapabilityRequirement, ProviderContractImplementation } from "../../interfaces/ProviderManifest";
import { ProviderManifestValidationError } from "../errors";
import { satisfiesVersionRange } from "../versioning/versionRange";

/** An implementation must preserve every dependency alternative promised by its contract. */
export function assertContractRequirements(
    implementation: ProviderContractImplementation,
    release: ContractRelease,
    path: string,
): void {
    for (const capability of release.capabilities) {
        for (const required of capability.requires ?? []) {
            const declared = implementation.requires.find(
                (candidate) =>
                    candidate.contractId === required.contractId && candidate.capabilityId === required.capabilityId,
            );
            if (!declared || declared.optional || !isVersionRangeSubset(required.versionRange, declared.versionRange)) {
                throw new ProviderManifestValidationError(
                    "resolution_failed",
                    `must declare a mandatory requirement covering ${required.contractId}/${required.capabilityId} ${required.versionRange} for ${capability.id}`,
                    `${path}.requires`,
                );
            }
        }
    }
}

export async function resolveRequirement(
    requirement: ProviderCapabilityRequirement,
    catalogue: ReleaseCatalogue,
    path: string,
): Promise<void> {
    const releases = await catalogue.list(requirement.contractId);
    const resolved = releases.some(
        (release) =>
            !release.yank &&
            satisfiesVersionRange(release.admission.release.version, requirement.versionRange) &&
            release.admission.release.capabilities.some((capability) => capability.id === requirement.capabilityId),
    );
    if (!resolved) {
        throw new ProviderManifestValidationError(
            "resolution_failed",
            `no non-yanked ${requirement.contractId} release in ${requirement.versionRange} exposes ${requirement.capabilityId}`,
            path,
        );
    }
}
