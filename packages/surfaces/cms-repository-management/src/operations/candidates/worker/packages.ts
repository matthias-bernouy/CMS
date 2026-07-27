import { computeIntegrationPackageDigest } from "@bernouy/cms-integration-packages";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import type { RepositoryCandidateExactMigrationPackage, RepositoryCandidateWorkerRoutesConfig } from "../contracts";

type PackageReference = MigrationVerificationInputV1["source"];

export async function resolveExactMigrationPackages(
    source: RepositoryCandidateWorkerRoutesConfig["packageSource"],
    inputs: readonly MigrationVerificationInputV1[],
    target: PackageReference,
): Promise<readonly RepositoryCandidateExactMigrationPackage[]> {
    const references = exactPackageReferences(inputs, target);
    if (references.length === 0) {
        return Object.freeze([]);
    }
    if (!source) {
        throw new Error("Candidate migration package source is unavailable");
    }
    const packages = await Promise.all(
        references.map(async (reference) => {
            const resolved = await source.getPackage(reference.kind, reference.version);
            if (
                !resolved ||
                resolved.digest !== reference.packageDigest ||
                resolved.envelope.kind !== reference.kind ||
                resolved.envelope.version !== reference.version ||
                (await computeIntegrationPackageDigest(resolved.envelope)) !== reference.packageDigest
            ) {
                throw new Error(`Exact migration package ${reference.kind}@${reference.version} is unavailable`);
            }
            return Object.freeze({ digest: reference.packageDigest, envelope: resolved.envelope });
        }),
    );
    return Object.freeze(packages);
}

function exactPackageReferences(
    inputs: readonly MigrationVerificationInputV1[],
    target: PackageReference,
): readonly PackageReference[] {
    const references = new Map<string, PackageReference>();
    for (const input of inputs) {
        if (
            input.target.kind !== target.kind ||
            input.target.version !== target.version ||
            input.target.packageDigest !== target.packageDigest
        ) {
            throw new Error("Candidate migration input targets another exact package");
        }
        addReference(references, input.source, target.packageDigest);
        for (const matrix of input.dependencyMatrices) {
            for (const dependency of matrix.dependencies) {
                addReference(references, dependency, target.packageDigest);
            }
        }
    }
    return [...references.values()].toSorted((left, right) => left.packageDigest.localeCompare(right.packageDigest));
}

function addReference(
    references: Map<string, PackageReference>,
    reference: PackageReference,
    targetDigest: string,
): void {
    if (reference.packageDigest === targetDigest) {
        return;
    }
    const existing = references.get(reference.packageDigest);
    if (existing && (existing.kind !== reference.kind || existing.version !== reference.version)) {
        throw new Error("Candidate migration package digest has conflicting identities");
    }
    references.set(reference.packageDigest, reference);
}
