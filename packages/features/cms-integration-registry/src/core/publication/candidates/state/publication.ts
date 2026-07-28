import type { IntegrationRegistryCandidateRecord } from "../../../../interfaces/publication";
import {
    assertCandidateRevision,
    assertCandidateTransition,
    candidateFailure,
    monotonicCandidateTimestamp,
    nextCandidateRecord,
} from "./shared";

export function beginIntegrationRegistryCandidatePublication(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{ expectedRevision: number; now: string }>,
): IntegrationRegistryCandidateRecord {
    assertCandidateRevision(record, input.expectedRevision);
    assertCandidateTransition(record, ["passed"], "publishing");
    return nextCandidateRecord(record, {
        status: "publishing",
        updatedAt: monotonicCandidateTimestamp(record, input.now),
    });
}

export function completeIntegrationRegistryCandidatePublication(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{ expectedRevision: number; now: string }>,
): IntegrationRegistryCandidateRecord {
    assertCandidateRevision(record, input.expectedRevision);
    assertCandidateTransition(record, ["publishing"], "published");
    return nextCandidateRecord(record, {
        status: "published",
        updatedAt: monotonicCandidateTimestamp(record, input.now),
    });
}

export function rejectIntegrationRegistryCandidatePublication(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        now: string;
        failure: NonNullable<IntegrationRegistryCandidateRecord["lastFailure"]> & Readonly<{ kind: "stale" }>;
    }>,
): IntegrationRegistryCandidateRecord {
    assertCandidateRevision(record, input.expectedRevision);
    assertCandidateTransition(record, ["passed", "publishing"], "rejected");
    const now = monotonicCandidateTimestamp(record, input.now);
    return nextCandidateRecord(record, {
        status: "rejected",
        updatedAt: now,
        lastFailure: candidateFailure(input.failure, now),
    });
}
