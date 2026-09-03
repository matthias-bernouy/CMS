import { computeIntegrationPackageDigest, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import {
    assertReleaseVerificationPlanMatchesVerification,
    computeIntegrationVerificationDigest,
    identifyMigrationVerificationInput,
    identifyReleaseAdmissionPolicySnapshot,
    validateBoundIntegrationVerificationAuthorSuites,
    validateAdmissionInputSnapshotForPolicy,
    validateIntegrationVerificationEnvelope,
    validateBehavioralRlsPlanBinding,
} from "@bernouy/cms-integration-verification";
import { VerificationProtocolError } from "../error";
import { record } from "../status";
import type { CandidateStatusProjection, ExactVerificationWorkload } from "../types";
import { parseExactDependencyPackages } from "./dependencyPackages";
import { parseExactMigrationPackages } from "./migrationPackages";
import { parseExactUpgradePackages } from "./upgradePackages";

export { parseExactDependencyPackages } from "./dependencyPackages";
export { parseExactMigrationPackages } from "./migrationPackages";
export { parseExactUpgradePackages } from "./upgradePackages";

export async function parseExactWorkload(
    value: unknown,
    candidate: CandidateStatusProjection,
): Promise<ExactVerificationWorkload> {
    try {
        const optionalFields = optionalWorkloadFields(value);
        const input = record(value, [
            "package",
            "verification",
            "policy",
            "admission",
            "authorSuites",
            ...optionalFields,
        ]);
        const packageEnvelope = validateIntegrationPackageEnvelope(input.package, { requireReleaseNotes: true });
        const verification = validateIntegrationVerificationEnvelope(input.verification);
        const policy = await identifyReleaseAdmissionPolicySnapshot(input.policy);
        const admission = await validateAdmissionInputSnapshotForPolicy(input.admission, policy.snapshot);
        if (admission.snapshot.releaseVerificationPlan) {
            assertReleaseVerificationPlanMatchesVerification(
                admission.snapshot.releaseVerificationPlan.plan,
                verification,
            );
        }
        const behavioralRlsPlan = await validateBehavioralRlsPlanBinding(
            input.behavioralRlsPlan,
            admission.snapshot.behavioralRlsPlan,
        );
        const authorSuites = await validateBoundIntegrationVerificationAuthorSuites(
            input.authorSuites,
            admission.snapshot,
        );
        const dependencyPackages = await parseExactDependencyPackages(
            input.dependencyPackages ?? [],
            admission.snapshot.dependencies,
        );
        const rawMigrationInputs = input.migrationInputs ?? [];
        if (!Array.isArray(rawMigrationInputs)) {
            throw new TypeError("Candidate migration input plan must be an array");
        }
        const identifiedMigrationInputs = await Promise.all(rawMigrationInputs.map(identifyMigrationVerificationInput));
        if (
            identifiedMigrationInputs.some(
                (entry, index) => index > 0 && entry.digest <= identifiedMigrationInputs[index - 1]!.digest,
            )
        ) {
            throw new TypeError("Candidate migration input plan is not canonical");
        }
        const migrationInputs = identifiedMigrationInputs.map((entry) => entry.input);
        const migrationPackages = await parseExactMigrationPackages(input.migrationPackages ?? [], migrationInputs, {
            kind: candidate.kind,
            version: candidate.version,
            packageDigest: candidate.packageDigest,
        });
        const upgradePackages = await parseExactUpgradePackages(
            input.upgradePackages ?? [],
            candidate.kind,
            admission.snapshot.releaseVerificationPlan?.plan.baselines ?? [],
        );
        const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
        const verificationDigest = await computeIntegrationVerificationDigest(verification);
        assertCandidateObjects(candidate, packageEnvelope, packageDigest, verification, verificationDigest);
        const bound = admission.snapshot.candidate;
        if (
            bound.candidateId !== candidate.candidateId ||
            bound.candidateDigest !== candidate.candidateDigest ||
            bound.kind !== candidate.kind ||
            bound.version !== candidate.version ||
            bound.packageDigest !== candidate.packageDigest ||
            bound.verificationDigest !== candidate.verificationDigest
        ) {
            throw new TypeError("Admission snapshot does not match the claimed candidate");
        }
        return Object.freeze({
            package: packageEnvelope,
            verification,
            policy: policy.snapshot,
            admission: admission.snapshot,
            ...(behavioralRlsPlan ? { behavioralRlsPlan } : {}),
            authorSuites,
            dependencyPackages,
            upgradePackages,
            migrationInputs,
            migrationPackages,
        });
    } catch (error) {
        if (error instanceof VerificationProtocolError) {
            throw error;
        }
        throw new VerificationProtocolError(
            "invalid-response",
            "Repository returned an invalid exact verification workload",
            false,
        );
    }
}

function optionalWorkloadFields(value: unknown): string[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
    }
    const input = value as Record<string, unknown>;
    return [
        ...(Object.hasOwn(input, "migrationInputs") ? ["migrationInputs"] : []),
        ...(Object.hasOwn(input, "migrationPackages") ? ["migrationPackages"] : []),
        ...(Object.hasOwn(input, "dependencyPackages") ? ["dependencyPackages"] : []),
        ...(Object.hasOwn(input, "behavioralRlsPlan") ? ["behavioralRlsPlan"] : []),
        ...(Object.hasOwn(input, "upgradePackages") ? ["upgradePackages"] : []),
    ];
}

function assertCandidateObjects(
    candidate: CandidateStatusProjection,
    packageEnvelope: ReturnType<typeof validateIntegrationPackageEnvelope>,
    packageDigest: string,
    verification: ReturnType<typeof validateIntegrationVerificationEnvelope>,
    verificationDigest: string,
): void {
    if (
        packageDigest !== candidate.packageDigest ||
        verificationDigest !== candidate.verificationDigest ||
        packageEnvelope.kind !== candidate.kind ||
        packageEnvelope.version !== candidate.version ||
        verification.target.kind !== candidate.kind ||
        verification.target.version !== candidate.version ||
        verification.target.packageDigest !== candidate.packageDigest
    ) {
        throw new TypeError("Candidate objects do not match their exact package identity");
    }
}
