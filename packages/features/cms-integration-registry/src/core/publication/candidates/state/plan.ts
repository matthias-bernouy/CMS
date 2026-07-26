import {
    identifyReleaseAdmissionPolicySnapshot,
    validateAdmissionInputSnapshotForPolicy,
    type AdmissionInputSnapshotV1,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCandidateRecord } from "../../../../interfaces/publication";
import {
    assertCandidateRevision,
    assertCandidateTransition,
    invalidCandidate,
    monotonicCandidateTimestamp,
    nextCandidateRecord,
} from "./shared";

export async function queueIntegrationRegistryCandidate(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        now: string;
        policy: ReleaseAdmissionPolicySnapshotV1;
        admission: AdmissionInputSnapshotV1;
    }>,
): Promise<IntegrationRegistryCandidateRecord> {
    assertCandidateRevision(record, input.expectedRevision);
    assertCandidateTransition(record, ["validating"], "queued");
    const now = monotonicCandidateTimestamp(record, input.now);
    if (Date.parse(now) >= Date.parse(record.expiresAt)) {
        invalidCandidate("Expired candidate cannot be queued");
    }
    const policy = await identifyReleaseAdmissionPolicySnapshot(input.policy);
    const admission = await validateAdmissionInputSnapshotForPolicy(input.admission, policy.snapshot);
    assertAdmissionCandidate(record, admission.snapshot.candidate);
    return nextCandidateRecord(record, {
        status: "queued",
        updatedAt: now,
        policyDigest: policy.digest,
        admissionInputDigest: admission.digest,
    });
}

export function assertAdmissionCandidate(
    record: IntegrationRegistryCandidateRecord,
    candidate: AdmissionInputSnapshotV1["candidate"],
): void {
    if (
        candidate.candidateId !== record.candidateId ||
        candidate.candidateDigest !== record.candidateDigest ||
        candidate.kind !== record.kind ||
        candidate.version !== record.version ||
        candidate.packageDigest !== record.packageDigest ||
        candidate.verificationDigest !== record.verificationDigest
    ) {
        invalidCandidate("Admission snapshot does not bind the exact candidate identity");
    }
}
