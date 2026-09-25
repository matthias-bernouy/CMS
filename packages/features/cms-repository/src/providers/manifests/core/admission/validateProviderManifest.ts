import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { ProviderManifestValidationError } from "../errors";
import type { ProviderManifest } from "../../interfaces/ProviderManifest";
import { assertAcyclicRequirements } from "./implementationGraph";
import { assertContractRequirements, resolveRequirement } from "./requirements";

export async function validateProviderManifestReferences(
    manifest: ProviderManifest,
    catalogue: ReleaseCatalogue,
): Promise<void> {
    const releases = await Promise.all(
        manifest.implementations.map(async (implementation, index) => {
            const path = `$.implementations[${index}]`;
            const release = await catalogue.get(implementation.contractId, implementation.version);
            if (!release || release.admission.digest !== implementation.digest) {
                throw new ProviderManifestValidationError(
                    "resolution_failed",
                    "implemented contract version and digest do not resolve to one catalogue release",
                    path,
                );
            }
            if (release.yank) {
                throw new ProviderManifestValidationError(
                    "resolution_failed",
                    "cannot implement a yanked contract release",
                    path,
                );
            }
            assertContractRequirements(implementation, release.admission.release, path);
            await Promise.all(
                implementation.requires.map((requirement, requirementIndex) =>
                    resolveRequirement(requirement, catalogue, `${path}.requires[${requirementIndex}]`),
                ),
            );
            return release.admission.release;
        }),
    );
    assertAcyclicRequirements(manifest, releases);
}
