import type { AdmittedContractRelease, ReleaseDigest } from "@bernouy/cms-repository/contracts";

export type ConformanceDependencyCoordinate = Readonly<{
    contractId: string;
    version: string;
    digest: ReleaseDigest;
}>;

export function conformanceDependencyCoordinates(sourceJson: string): ConformanceDependencyCoordinate[] {
    const source = JSON.parse(sourceJson) as {
        dependencyProfiles?: { releases?: Partial<ConformanceDependencyCoordinate>[] }[];
    };
    const coordinates = new Map<string, ConformanceDependencyCoordinate>();
    for (const profile of source.dependencyProfiles ?? []) {
        for (const release of profile.releases ?? []) {
            if (
                typeof release.contractId !== "string" ||
                typeof release.version !== "string" ||
                typeof release.digest !== "string"
            ) {
                throw new Error("Conformance dependency coordinates require contractId, version and digest strings");
            }
            const coordinate = release as ConformanceDependencyCoordinate;
            coordinates.set(`${coordinate.contractId}\0${coordinate.version}\0${coordinate.digest}`, coordinate);
        }
    }
    return [...coordinates.values()];
}

export async function resolveConformanceDependencies(
    sourceJson: string,
    resolve: (contractId: string, version: string) => Promise<AdmittedContractRelease | null>,
): Promise<AdmittedContractRelease[]> {
    const dependencies = new Map<string, AdmittedContractRelease>();
    for (const coordinate of conformanceDependencyCoordinates(sourceJson)) {
        const admission = await resolve(coordinate.contractId, coordinate.version);
        if (!admission) {
            throw new Error(
                `Conformance source references unavailable dependency ${coordinate.contractId}@${coordinate.version}`,
            );
        }
        if (admission.digest !== coordinate.digest) {
            throw new Error(`Conformance dependency ${coordinate.contractId}@${coordinate.version} has another digest`);
        }
        dependencies.set(`${coordinate.contractId}\0${coordinate.version}\0${coordinate.digest}`, admission);
    }
    return [...dependencies.values()];
}
