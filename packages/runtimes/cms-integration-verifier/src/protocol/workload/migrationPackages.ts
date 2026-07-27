import { computeIntegrationPackageDigest, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { record } from "../status";
import type { ExactMigrationPackage } from "../types";

type PackageReference = MigrationVerificationInputV1["source"];

export async function parseExactMigrationPackages(
    value: unknown,
    inputs: readonly MigrationVerificationInputV1[],
    target: PackageReference,
): Promise<readonly ExactMigrationPackage[]> {
    if (!Array.isArray(value)) {
        throw new TypeError("Candidate migration packages must be an array");
    }
    const expected = exactPackageReferences(inputs, target);
    if (value.length !== expected.length) {
        throw new TypeError("Candidate migration package set is incomplete or contains extras");
    }
    const packages = await Promise.all(
        value.map(async (entry, index) => {
            const input = record(entry, ["digest", "envelope"]);
            const reference = expected[index]!;
            const envelope = validateIntegrationPackageEnvelope(input.envelope);
            const digest = await computeIntegrationPackageDigest(envelope);
            if (
                input.digest !== digest ||
                digest !== reference.packageDigest ||
                envelope.kind !== reference.kind ||
                envelope.version !== reference.version
            ) {
                throw new TypeError("Candidate migration package does not match its exact reference");
            }
            return Object.freeze({ digest, envelope });
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
            throw new TypeError("Candidate migration input targets another exact package");
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
        throw new TypeError("Candidate migration package digest has conflicting identities");
    }
    references.set(reference.packageDigest, reference);
}
