import { computeIntegrationPackageDigest, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    identifyReleaseAdmissionPolicySnapshot,
    validateAdmissionInputSnapshotForPolicy,
    validateIntegrationVerificationEnvelope,
} from "@bernouy/cms-integration-verification";
import { VerificationProtocolError } from "./error";
import { record } from "./status";
import type { CandidateStatusProjection, ExactVerificationWorkload } from "./types";

export async function parseExactWorkload(
    value: unknown,
    candidate: CandidateStatusProjection,
): Promise<ExactVerificationWorkload> {
    try {
        const input = record(value, ["package", "verification", "policy", "admission"]);
        const packageEnvelope = validateIntegrationPackageEnvelope(input.package, { requireReleaseNotes: true });
        const verification = validateIntegrationVerificationEnvelope(input.verification);
        const policy = await identifyReleaseAdmissionPolicySnapshot(input.policy);
        const admission = await validateAdmissionInputSnapshotForPolicy(input.admission, policy.snapshot);
        const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
        const verificationDigest = await computeIntegrationVerificationDigest(verification);
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
