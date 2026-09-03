import type { IntegrationRegistryCandidateRecord } from "../../../interfaces/publication";
import { IntegrationRegistryCandidateError } from "./errors";

export function recoverExpiredIntegrationRegistryCandidateLease(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{ expectedRevision: number; now: string; maximumAttempts: number }>,
): IntegrationRegistryCandidateRecord {
    if (record.revision !== input.expectedRevision) {
        throw new IntegrationRegistryCandidateError(
            "revision_conflict",
            `Candidate revision changed from expected ${input.expectedRevision} to ${record.revision}`,
        );
    }
    if (record.status !== "running" || !record.lease) {
        throw new IntegrationRegistryCandidateError("lease_conflict", "Candidate has no running lease to recover");
    }
    const parsedNow = Date.parse(input.now);
    if (!Number.isFinite(parsedNow) || new Date(parsedNow).toISOString() !== input.now) {
        throw new IntegrationRegistryCandidateError(
            "invalid_candidate",
            "Candidate recovery time must be an ISO timestamp",
        );
    }
    if (Date.parse(input.now) < Date.parse(record.updatedAt)) {
        throw new IntegrationRegistryCandidateError(
            "invalid_candidate",
            "Candidate update time must not move backwards",
        );
    }
    if (Date.parse(input.now) < Date.parse(record.lease.leaseExpiresAt)) {
        throw new IntegrationRegistryCandidateError("lease_conflict", "Candidate running lease has not expired");
    }
    if (!Number.isSafeInteger(input.maximumAttempts) || input.maximumAttempts < 1) {
        throw new IntegrationRegistryCandidateError(
            "invalid_candidate",
            "Candidate recovery maximum attempts must be a positive safe integer",
        );
    }
    const retryable = record.attemptCount < input.maximumAttempts;
    const { lease: _expiredLease, ...withoutLease } = record;
    return Object.freeze({
        ...withoutLease,
        revision: record.revision + 1,
        status: retryable ? "queued" : "rejected",
        updatedAt: input.now,
        lastFailure: Object.freeze({
            kind: "infrastructure",
            code: retryable ? "lease_expired" : "verification_infrastructure_exhausted",
            message: retryable
                ? "Candidate worker lease expired before completion"
                : "Candidate worker lease expired and exhausted the admission retry policy",
            occurredAt: input.now,
        }),
    });
}
