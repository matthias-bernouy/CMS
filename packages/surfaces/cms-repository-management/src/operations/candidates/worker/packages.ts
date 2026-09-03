import { computeIntegrationPackageDigest } from "@bernouy/cms-integration-packages";
import type {
    AdmissionDependencyReferenceV1,
    AdmissionInputSnapshotV1,
    MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";
import type {
    RepositoryCandidateExactDependencyPackage,
    RepositoryCandidateExactMigrationPackage,
    RepositoryCandidateExactUpgradePackage,
    RepositoryCandidateWorkerRoutesConfig,
} from "../contracts";

type PackageReference = MigrationVerificationInputV1["source"];

export async function resolveExactUpgradePackages(
    source: RepositoryCandidateWorkerRoutesConfig["packageSource"],
    kind: string,
    references: NonNullable<AdmissionInputSnapshotV1["releaseVerificationPlan"]>["plan"]["baselines"],
): Promise<readonly RepositoryCandidateExactUpgradePackage[]> {
    if (references.length === 0) {
        return Object.freeze([]);
    }
    if (!source) {
        throw new Error("Candidate upgrade package source is unavailable");
    }
    return Object.freeze(
        await Promise.all(
            references.map(async (reference) => {
                const exact = { kind, version: reference.version, packageDigest: reference.packageDigest };
                const resolved = await resolveExactPackage(source, exact, "upgrade");
                return Object.freeze({ ...exact, envelope: resolved.envelope });
            }),
        ),
    );
}

export async function resolveExactDependencyPackages(
    source: RepositoryCandidateWorkerRoutesConfig["packageSource"],
    references: readonly AdmissionDependencyReferenceV1[],
): Promise<readonly RepositoryCandidateExactDependencyPackage[]> {
    if (references.length === 0) {
        return Object.freeze([]);
    }
    if (!source) {
        throw new Error("Candidate dependency package source is unavailable");
    }
    return Object.freeze(
        await Promise.all(
            references.map(async (reference) => {
                if (!reference.selection) {
                    throw new Error("Candidate dependency reference has no exact matrix selection");
                }
                const resolved = await resolveExactPackage(source, reference, "dependency");
                return Object.freeze({
                    selection: reference.selection,
                    kind: reference.kind,
                    version: reference.version,
                    packageDigest: reference.packageDigest,
                    envelope: resolved.envelope,
                });
            }),
        ),
    );
}

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
            const resolved = await resolveExactPackage(source, reference, "migration");
            return Object.freeze({ digest: reference.packageDigest, envelope: resolved.envelope });
        }),
    );
    return Object.freeze(packages);
}

async function resolveExactPackage(
    source: NonNullable<RepositoryCandidateWorkerRoutesConfig["packageSource"]>,
    reference: PackageReference,
    purpose: "dependency" | "migration" | "upgrade",
) {
    const resolved = await source.getPackage(reference.kind, reference.version);
    if (
        !resolved ||
        resolved.digest !== reference.packageDigest ||
        resolved.envelope.kind !== reference.kind ||
        resolved.envelope.version !== reference.version ||
        (await computeIntegrationPackageDigest(resolved.envelope)) !== reference.packageDigest
    ) {
        throw new Error(`Exact ${purpose} package ${reference.kind}@${reference.version} is unavailable`);
    }
    return resolved;
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
