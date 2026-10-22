import { resolveContractLineage, type ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { ProviderManifestValidationError } from "../errors";
import type { ProviderManifest } from "../../interfaces/ProviderManifest";
import { assertAcyclicRequirements } from "./implementationGraph";
import { assertContractRequirements, resolveRequirement } from "./requirements";

export async function validateProviderManifestReferences(
    manifest: ProviderManifest,
    catalogue: ReleaseCatalogue,
): Promise<void> {
    const lineages = await Promise.all(
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
            const lineage = await resolveContractLineage(catalogue, release.admission.release);
            assertContractRequirements(implementation, lineage, path);
            await Promise.all(
                implementation.requires.map((requirement, requirementIndex) =>
                    resolveRequirement(requirement, catalogue, `${path}.requires[${requirementIndex}]`),
                ),
            );
            return lineage;
        }),
    );
    assertDisjointImplementations(lineages);
    assertAcyclicRequirements(manifest, lineages);
}

function assertDisjointImplementations(lineages: readonly (readonly { contractId: string }[])[]): void {
    const owners = new Map<string, string>();
    for (const lineage of lineages) {
        const concrete = lineage[0]!.contractId;
        for (const release of lineage) {
            const owner = owners.get(release.contractId);
            if (owner && owner !== concrete) {
                throw new ProviderManifestValidationError(
                    "invalid_manifest",
                    `${owner} and ${concrete} both implement ${release.contractId}`,
                    "$.implementations",
                );
            }
            owners.set(release.contractId, concrete);
        }
    }
}
