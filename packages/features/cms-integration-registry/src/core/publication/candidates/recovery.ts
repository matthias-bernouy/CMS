import type { IntegrationRegistryCandidateRecord } from "../../../interfaces/publication";
import { IntegrationRegistryCandidateError } from "./errors";

export function recoverExpiredIntegrationRegistryCandidateLease(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{ expectedRevision: number; now: string }>,
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
    const { lease: _expiredLease, ...withoutLease } = record;
    return Object.freeze({
        ...withoutLease,
        revision: record.revision + 1,
        status: "queued",
        updatedAt: input.now,
        lastFailure: Object.freeze({
            kind: "infrastructure",
            code: "lease_expired",
            message: "Candidate worker lease expired before completion",
            occurredAt: input.now,
        }),
    });
}
