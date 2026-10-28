import type { ContractRelease } from "cms-repository/exports/contracts/index";
import type { ProviderManifest } from "../../interfaces/ProviderManifest";
import { ProviderManifestValidationError } from "../protocol/errors";
import { satisfiesVersionRange } from "../versioning/versionRange";

/** Distinct served releases are distinct nodes, including when they share a contract ID. */
export function assertAcyclicRequirements(
    manifest: ProviderManifest,
    lineages: readonly (readonly ContractRelease[])[],
): void {
    const edges = manifest.implementations.map((implementation) =>
        lineages.flatMap((lineage, index) =>
            implementation.requires.some((requirement) =>
                lineage.some(
                    (release) =>
                        requirement.contractId === release.contractId &&
                        satisfiesVersionRange(release.version, requirement.versionRange) &&
                        release.capabilities.some((capability) => capability.id === requirement.capabilityId),
                ),
            )
                ? [index]
                : [],
        ),
    );
    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (index: number): void => {
        if (visiting.has(index)) {
            const release = lineages[index]![0]!;
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                `implemented contract requirements contain a cycle through ${release.contractId}@${release.version}`,
                "$.implementations",
            );
        }
        if (visited.has(index)) {
            return;
        }
        visiting.add(index);
        for (const dependency of edges[index]!) {
            visit(dependency);
        }
        visiting.delete(index);
        visited.add(index);
    };
    for (let index = 0; index < lineages.length; index++) {
        visit(index);
    }
}
