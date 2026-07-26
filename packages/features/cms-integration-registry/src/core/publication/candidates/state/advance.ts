import type {
    IntegrationRegistryCandidateFailure,
    IntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidateStatus,
} from "../../../../interfaces/publication";
import {
    assertCandidateRevision,
    assertCandidateTransition,
    candidateFailure,
    invalidCandidate,
    monotonicCandidateTimestamp,
    nextCandidateRecord,
} from "./shared";

export function advanceIntegrationRegistryCandidate(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        status: "validating" | "rejected" | "expired";
        now: string;
        failure?: IntegrationRegistryCandidateFailure;
    }>,
): IntegrationRegistryCandidateRecord {
    assertCandidateRevision(record, input.expectedRevision);
    const now = monotonicCandidateTimestamp(record, input.now);
    const allowed: Readonly<Record<typeof input.status, readonly IntegrationRegistryCandidateStatus[]>> = {
        validating: ["uploaded"],
        rejected: ["validating"],
        expired: ["uploaded", "validating", "queued"],
    };
    assertCandidateTransition(record, allowed[input.status] ?? [], input.status);
    if (input.status === "expired" && Date.parse(now) < Date.parse(record.expiresAt)) {
        invalidCandidate("Candidate cannot expire before expiresAt");
    }
    if (input.status === "rejected" && (!input.failure || input.failure.kind !== "validation")) {
        invalidCandidate("Validation rejection requires a validation failure reason");
    }
    return nextCandidateRecord(record, {
        status: input.status,
        updatedAt: now,
        ...(input.failure ? { lastFailure: candidateFailure(input.failure, now) } : {}),
    });
}
