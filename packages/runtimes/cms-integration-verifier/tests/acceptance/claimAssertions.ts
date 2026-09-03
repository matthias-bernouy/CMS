import { expect } from "bun:test";
import { computeIntegrationPackageDigest } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    identifyReleaseAdmissionPolicySnapshot,
} from "@bernouy/cms-integration-verification";
import { OFFICIAL_CANDIDATE_RUNNER_REQUIREMENT } from "@bernouy/cms-official-integrations/publication";
import { PRODUCTION_RUNNER } from "./fixtureResources";
import { type startOfficialCandidateAcceptance } from "./support";

type Acceptance = Awaited<ReturnType<typeof startOfficialCandidateAcceptance>>;

export async function assertExactClaim(
    claimed: Acceptance["trace"]["claimed"],
    sourceDigest: string,
    targetDigest: string,
    basicBlocsDigest: string,
): Promise<void> {
    if (!claimed) {
        throw new Error("Official candidate was not claimed through the worker protocol");
    }
    expect(claimed.workload.verification.manifest.runnerRequirements).toEqual([OFFICIAL_CANDIDATE_RUNNER_REQUIREMENT]);
    expect(claimed.workload.policy.identity).toEqual({ name: "repository-admission", version: "1.7.0" });
    expect(claimed.workload.policy.staticEvaluator).toEqual({
        name: "repository-static-compatibility",
        version: "1.1.0",
    });
    expect(claimed.workload.policy.verificationPolicy).toEqual({
        name: "repository-verification",
        version: "1.5.0",
    });
    expect(claimed.workload.admission.selectedRunner).toEqual(PRODUCTION_RUNNER);
    expect(await computeIntegrationPackageDigest(claimed.workload.package)).toBe(targetDigest);
    expect(await computeIntegrationVerificationDigest(claimed.workload.verification)).toBe(
        claimed.candidate.verificationDigest,
    );
    expect(claimed.workload.package).toMatchObject({ kind: "photo-albums", version: "1.1.0" });
    expect(claimed.workload.verification.target).toEqual({
        kind: "photo-albums",
        version: "1.1.0",
        packageDigest: targetDigest,
    });
    expect(claimed.workload.admission.candidate).toEqual({
        candidateId: claimed.candidate.candidateId,
        candidateDigest: claimed.candidate.candidateDigest,
        kind: "photo-albums",
        version: "1.1.0",
        packageDigest: targetDigest,
        verificationDigest: claimed.candidate.verificationDigest,
    });
    expect(claimed.candidate.packageDigest).toBe(targetDigest);
    expect(claimed.workload.admission.policyDigest).toBe(
        (await identifyReleaseAdmissionPolicySnapshot(claimed.workload.policy)).digest,
    );
    expect(claimed.workload.admission.reviewedBaselines).toHaveLength(1);
    expect(claimed.workload.admission.reviewedBaselines[0]).toMatchObject({
        kind: "photo-albums",
        version: "1.0.0",
        packageDigest: sourceDigest,
        connectorKey: "primary",
        lineageId: "photo-albums-supabase-v1",
    });
    expect(claimed.workload.admission.releaseVerificationPlan?.plan.baselines).toEqual([
        expect.objectContaining({ version: "1.0.0", packageDigest: sourceDigest }),
    ]);
    expect(
        claimed.workload.upgradePackages.map(({ kind, version, packageDigest, envelope }) => ({
            kind,
            version,
            packageDigest,
            envelopeKind: envelope.kind,
            envelopeVersion: envelope.version,
        })),
    ).toEqual([
        {
            kind: "photo-albums",
            version: "1.0.0",
            packageDigest: sourceDigest,
            envelopeKind: "photo-albums",
            envelopeVersion: "1.0.0",
        },
    ]);
    const expectedDependencies = [
        { selection: "minimum" as const, kind: "basic-blocs", version: "1.0.0", packageDigest: basicBlocsDigest },
        { selection: "stable" as const, kind: "basic-blocs", version: "1.0.0", packageDigest: basicBlocsDigest },
    ];
    expect(claimed.workload.admission.dependencies).toEqual(expectedDependencies);
    expect(claimed.workload.migrationInputs).toHaveLength(1);
    expect(claimed.workload.migrationInputs[0]).toMatchObject({
        source: { kind: "photo-albums", version: "1.0.0", packageDigest: sourceDigest },
        target: { kind: "photo-albums", version: "1.1.0", packageDigest: targetDigest },
    });
    expect(claimed.workload.migrationInputs[0]?.dependencyMatrices).toEqual([
        {
            selection: "minimum",
            dependencies: [{ kind: "basic-blocs", version: "1.0.0", packageDigest: basicBlocsDigest }],
        },
        {
            selection: "stable",
            dependencies: [{ kind: "basic-blocs", version: "1.0.0", packageDigest: basicBlocsDigest }],
        },
    ]);
    expect(exactMigrationPackageReferences(claimed)).toEqual(expectedMigrationPackageReferences(claimed));
    expect(
        claimed.workload.dependencyPackages.map(({ selection, kind, version, packageDigest, envelope }) => ({
            selection,
            kind,
            version,
            packageDigest,
            envelopeKind: envelope.kind,
            envelopeVersion: envelope.version,
        })),
    ).toEqual(
        expectedDependencies.map(({ selection, kind, version, packageDigest }) => ({
            selection,
            kind,
            version,
            packageDigest,
            envelopeKind: kind,
            envelopeVersion: version,
        })),
    );
}

function exactMigrationPackageReferences(claimed: NonNullable<Acceptance["trace"]["claimed"]>) {
    return claimed.workload.migrationPackages
        .map(({ digest, envelope }) => ({ kind: envelope.kind, version: envelope.version, packageDigest: digest }))
        .toSorted((left, right) => left.packageDigest.localeCompare(right.packageDigest));
}

function expectedMigrationPackageReferences(claimed: NonNullable<Acceptance["trace"]["claimed"]>) {
    const targetDigest = claimed.candidate.packageDigest;
    const references = new Map<string, { kind: string; version: string; packageDigest: string }>();
    for (const input of claimed.workload.migrationInputs) {
        for (const reference of [
            input.source,
            ...input.dependencyMatrices.flatMap(({ dependencies }) => dependencies),
        ]) {
            if (reference.packageDigest !== targetDigest) {
                references.set(reference.packageDigest, reference);
            }
        }
    }
    return [...references.values()].toSorted((left, right) => left.packageDigest.localeCompare(right.packageDigest));
}
