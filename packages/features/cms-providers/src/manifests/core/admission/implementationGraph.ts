import type { ContractRelease } from "@bernouy/cms-contracts";
import type { ProviderManifest } from "../../interfaces/ProviderManifest";
import { ProviderManifestValidationError } from "../errors";
import { satisfiesVersionRange } from "../versioning/versionRange";

/** Distinct served releases are distinct nodes, including when they share a contract ID. */
export function assertAcyclicRequirements(manifest: ProviderManifest, releases: readonly ContractRelease[]): void {
    const edges = manifest.implementations.map((implementation) =>
        releases.flatMap((release, index) =>
            implementation.requires.some(
                (requirement) =>
                    requirement.contractId === release.contractId &&
                    satisfiesVersionRange(release.version, requirement.versionRange) &&
                    release.capabilities.some((capability) => capability.id === requirement.capabilityId),
            )
                ? [index]
                : [],
        ),
    );
    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (index: number): void => {
        if (visiting.has(index)) {
            const release = releases[index]!;
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
    for (let index = 0; index < releases.length; index++) {
        visit(index);
    }
}
