import {
    identifyReleaseAdmissionPolicySnapshot,
    validateAdmissionInputSnapshotForPolicy,
    validateCandidateAdmissionJobResultForPlan,
    identifyVerificationJobResult,
    type AdmissionInputSnapshotV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type CandidateAdmissionJobResultV1,
    type MigrationVerificationInputV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCandidateRecord } from "../../../../interfaces/publication";
import { asCandidateAdmissionJobResult, candidateAdmissionJobOutcome } from "./admissionResult";
import { assertAdmissionCandidate } from "./plan";
import {
    assertCandidateLease,
    assertCandidateLeaseCurrent,
    assertCandidateLeaseWithinTtl,
    assertCandidateRevision,
    assertCandidateTransition,
    candidateFailure,
    invalidCandidate,
    monotonicCandidateTimestamp,
    nextCandidateRecord,
    parseCandidateLease,
} from "./shared";

export function claimIntegrationRegistryCandidate(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        jobId: string;
        attemptId: string;
        fencingToken: number;
        workerId: string;
        now: string;
        leaseExpiresAt: string;
    }>,
): IntegrationRegistryCandidateRecord {
    assertCandidateRevision(record, input.expectedRevision);
    assertCandidateTransition(record, ["queued"], "running");
    if (!record.policyDigest || !record.admissionInputDigest) {
        invalidCandidate("Candidate cannot be claimed without exact admission inputs");
    }
    const now = monotonicCandidateTimestamp(record, input.now);
    if (Date.parse(now) >= Date.parse(record.expiresAt)) {
        invalidCandidate("Expired candidate cannot be claimed");
    }
    const lease = parseCandidateLease(input, now);
    assertCandidateLeaseWithinTtl(record, lease.leaseExpiresAt);
    return nextCandidateRecord(record, {
        status: "running",
        updatedAt: now,
        attemptCount: record.attemptCount + 1,
        lease,
    });
}

export function renewIntegrationRegistryCandidateLease(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        attemptId: string;
        fencingToken: number;
        now: string;
        leaseExpiresAt: string;
    }>,
): IntegrationRegistryCandidateRecord {
    assertCandidateRevision(record, input.expectedRevision);
    const lease = assertCandidateLease(record, input.attemptId, input.fencingToken);
    const now = monotonicCandidateTimestamp(record, input.now);
    assertCandidateLeaseCurrent(lease, now);
    const leaseExpiresAt = new Date(Date.parse(input.leaseExpiresAt)).toISOString();
    if (leaseExpiresAt !== input.leaseExpiresAt || Date.parse(leaseExpiresAt) <= Date.parse(lease.leaseExpiresAt)) {
        invalidCandidate("Renewed candidate lease must be a canonical timestamp after the current expiry");
    }
    assertCandidateLeaseWithinTtl(record, leaseExpiresAt);
    return nextCandidateRecord(record, { updatedAt: now, lease: Object.freeze({ ...lease, leaseExpiresAt }) });
}

export async function completeIntegrationRegistryCandidateAttempt(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        now: string;
        result: CandidateAdmissionJobResultV1 | VerificationJobResultV1;
        migrationInputs?: readonly MigrationVerificationInputV1[];
        admission: AdmissionInputSnapshotV1;
        policy: ReleaseAdmissionPolicySnapshotV1;
    }>,
): Promise<IntegrationRegistryCandidateRecord> {
    assertCandidateRevision(record, input.expectedRevision);
    if (!record.lease || !record.policyDigest || !record.admissionInputDigest) {
        invalidCandidate("Candidate running attempt is missing exact admission inputs");
    }
    const admissionResult = asCandidateAdmissionJobResult(input.result);
    const verificationResult = admissionResult.verification;
    const lease = assertCandidateLease(record, verificationResult.attemptId, verificationResult.fencingToken);
    const now = monotonicCandidateTimestamp(record, input.now);
    assertCandidateLeaseCurrent(lease, now);
    const policy = await identifyReleaseAdmissionPolicySnapshot(input.policy);
    const admission = await validateAdmissionInputSnapshotForPolicy(input.admission, policy.snapshot);
    if (policy.digest !== record.policyDigest || admission.digest !== record.admissionInputDigest) {
        invalidCandidate("Candidate completion admission inputs differ from its immutable queued plan");
    }
    assertAdmissionCandidate(record, admission.snapshot.candidate);
    const result = await validateCandidateAdmissionJobResultForPlan(
        admissionResult,
        input.migrationInputs ?? [],
        admission.snapshot,
        policy.snapshot,
        {
            jobId: lease.jobId,
            attemptId: lease.attemptId,
            fencingToken: lease.fencingToken,
        },
    );
    const verification = await identifyVerificationJobResult(result.result.verification);
    return completeWithDerivedOutcome(record, policy.snapshot, result.result, verification.digest, result.digest, now);
}

function completeWithDerivedOutcome(
    record: IntegrationRegistryCandidateRecord,
    policy: ReleaseAdmissionPolicySnapshotV1,
    result: CandidateAdmissionJobResultV1,
    verificationJobResultDigest: string,
    admissionJobResultDigest: string,
    now: string,
): IntegrationRegistryCandidateRecord {
    const outcome = candidateAdmissionJobOutcome(result, policy);
    const retryable =
        outcome === "infrastructure-failure" &&
        policy.retry.retryableOutcomes.includes("infrastructure-failure") &&
        record.attemptCount < policy.retry.maximumAttempts;
    return nextCandidateRecord(record, {
        status: outcome === "passed" ? "passed" : retryable ? "queued" : "rejected",
        updatedAt: now,
        verificationJobResultDigest,
        admissionJobResultDigest,
        lease: undefined,
        ...(outcome === "passed" ? { lastFailure: undefined } : derivedFailure(outcome, retryable, now)),
    });
}

function derivedFailure(outcome: "rejected" | "infrastructure-failure", retryable: boolean, now: string) {
    return {
        lastFailure: candidateFailure(
            {
                kind: outcome === "infrastructure-failure" ? "infrastructure" : "suite",
                code:
                    outcome === "infrastructure-failure"
                        ? retryable
                            ? "verification_infrastructure_retry"
                            : "verification_infrastructure_exhausted"
                        : "verification_failed",
                message:
                    outcome === "infrastructure-failure"
                        ? retryable
                            ? "Verification infrastructure failed; the candidate remains queued for retry"
                            : "Verification infrastructure failed and exhausted the admission retry policy"
                        : "One or more planned verification suites did not pass",
                occurredAt: now,
            },
            now,
        ),
    };
}
