import type {
    IntegrationRegistryCandidateFailure,
    IntegrationRegistryCandidateLease,
    IntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidateStatus,
} from "../../../../interfaces/publication";
import { IntegrationRegistryCandidateError } from "../errors";

export const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function nextCandidateRecord(
    record: IntegrationRegistryCandidateRecord,
    changes: Partial<IntegrationRegistryCandidateRecord>,
): IntegrationRegistryCandidateRecord {
    const next = { ...record, ...changes, revision: record.revision + 1 };
    if ("lease" in changes && changes.lease === undefined) {
        delete next.lease;
    }
    if ("lastFailure" in changes && changes.lastFailure === undefined) {
        delete next.lastFailure;
    }
    return freezeCandidateRecord(next);
}

export function freezeCandidateRecord(record: IntegrationRegistryCandidateRecord): IntegrationRegistryCandidateRecord {
    return Object.freeze({
        ...record,
        ...(record.lease ? { lease: Object.freeze({ ...record.lease }) } : {}),
        ...(record.lastFailure ? { lastFailure: Object.freeze({ ...record.lastFailure }) } : {}),
    });
}

export function parseCandidateLease(
    input: Readonly<{
        jobId: string;
        attemptId: string;
        fencingToken: number;
        workerId: string;
        leaseExpiresAt: string;
    }>,
    now: string,
): IntegrationRegistryCandidateLease {
    identifier(input.jobId, "jobId");
    identifier(input.attemptId, "attemptId");
    identifier(input.workerId, "workerId");
    if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) {
        invalidCandidate("Candidate fencingToken must be a positive safe integer");
    }
    const leaseExpiresAt = timestamp(input.leaseExpiresAt, "leaseExpiresAt");
    if (Date.parse(leaseExpiresAt) <= Date.parse(now)) {
        invalidCandidate("Candidate lease expiry must be later than claim time");
    }
    return Object.freeze({
        jobId: input.jobId,
        attemptId: input.attemptId,
        fencingToken: input.fencingToken,
        workerId: input.workerId,
        claimedAt: now,
        leaseExpiresAt,
    });
}

export function assertCandidateLease(
    record: IntegrationRegistryCandidateRecord,
    attemptId: string,
    fencingToken: number,
): IntegrationRegistryCandidateLease {
    if (
        record.status !== "running" ||
        !record.lease ||
        record.lease.attemptId !== attemptId ||
        record.lease.fencingToken !== fencingToken
    ) {
        throw new IntegrationRegistryCandidateError("lease_conflict", "Candidate attempt lease is no longer current");
    }
    return record.lease;
}

export function assertCandidateLeaseCurrent(lease: IntegrationRegistryCandidateLease, now: string): void {
    if (Date.parse(now) >= Date.parse(lease.leaseExpiresAt)) {
        throw new IntegrationRegistryCandidateError("lease_expired", "Candidate attempt lease has expired");
    }
}

export function assertCandidateLeaseWithinTtl(
    record: IntegrationRegistryCandidateRecord,
    leaseExpiresAt: string,
): void {
    if (Date.parse(leaseExpiresAt) > Date.parse(record.expiresAt)) {
        invalidCandidate("Candidate lease expiry cannot exceed the immutable candidate expiry");
    }
}

export function assertCandidateRevision(record: IntegrationRegistryCandidateRecord, expected: number): void {
    if (record.revision !== expected) {
        throw new IntegrationRegistryCandidateError(
            "revision_conflict",
            `Candidate revision changed from expected ${expected} to ${record.revision}`,
        );
    }
}

export function monotonicCandidateTimestamp(record: IntegrationRegistryCandidateRecord, value: string): string {
    const parsed = timestamp(value, "now");
    if (Date.parse(parsed) < Date.parse(record.updatedAt)) {
        invalidCandidate("Candidate update time must not move backwards");
    }
    return parsed;
}

export function candidateFailure(
    value: IntegrationRegistryCandidateFailure,
    now: string,
): IntegrationRegistryCandidateFailure {
    if (timestamp(value.occurredAt, "failure.occurredAt") !== now) {
        invalidCandidate("Candidate failure time must equal the state transition time");
    }
    identifier(value.code, "failure.code");
    if (!value.message.trim() || value.message.length > 4_096) {
        invalidCandidate("Candidate failure message must contain at most 4096 characters");
    }
    return Object.freeze({ ...value });
}

export function assertCandidateTransition(
    record: IntegrationRegistryCandidateRecord,
    allowed: readonly IntegrationRegistryCandidateStatus[],
    to: IntegrationRegistryCandidateStatus,
): void {
    if (!allowed.includes(record.status)) {
        throw new IntegrationRegistryCandidateError(
            "invalid_transition",
            `Candidate cannot transition from ${record.status} to ${to}`,
        );
    }
}

export function identifier(value: string, field: string): void {
    if (!IDENTIFIER.test(value)) {
        invalidCandidate(`Candidate ${field} must be a path-safe identifier`);
    }
}

export function timestamp(value: string, field: string): string {
    const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        invalidCandidate(`Candidate ${field} must be an ISO timestamp`);
    }
    return value;
}

export function invalidCandidate(message: string): never {
    throw new IntegrationRegistryCandidateError("invalid_candidate", message);
}
