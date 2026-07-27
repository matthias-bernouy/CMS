import { computeIntegrationPackageDigest, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    identifyMigrationVerificationInput,
    identifyReleaseAdmissionPolicySnapshot,
    validateAdmissionInputSnapshotForPolicy,
    validateIntegrationVerificationEnvelope,
} from "@bernouy/cms-integration-verification";
import { VerificationProtocolError } from "../error";
import { record } from "../status";
import type { CandidateStatusProjection, ExactVerificationWorkload } from "../types";
import { parseExactMigrationPackages } from "./migrationPackages";

export { parseExactMigrationPackages } from "./migrationPackages";

export async function parseExactWorkload(
    value: unknown,
    candidate: CandidateStatusProjection,
): Promise<ExactVerificationWorkload> {
    try {
        const optionalFields = optionalWorkloadFields(value);
        const input = record(value, ["package", "verification", "policy", "admission", ...optionalFields]);
        const packageEnvelope = validateIntegrationPackageEnvelope(input.package, { requireReleaseNotes: true });
        const verification = validateIntegrationVerificationEnvelope(input.verification);
        const policy = await identifyReleaseAdmissionPolicySnapshot(input.policy);
        const admission = await validateAdmissionInputSnapshotForPolicy(input.admission, policy.snapshot);
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
