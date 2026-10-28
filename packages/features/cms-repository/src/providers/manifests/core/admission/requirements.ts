import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import type { ProviderCapabilityRequirement } from "../../interfaces/ProviderManifest";
import { ProviderManifestValidationError } from "../protocol/errors";
import { satisfiesVersionRange } from "../versioning/versionRange";

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
