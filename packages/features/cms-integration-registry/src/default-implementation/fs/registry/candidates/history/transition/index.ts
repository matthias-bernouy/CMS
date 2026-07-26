import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { assertClaim, assertCompletion, assertLeaseRecovery, assertRenewal } from "./attempt";
import { assertRecordDelta, assertStableIdentity, corrupt } from "./shared";

export function assertInitialCandidateRecord(record: IntegrationRegistryCandidateRecord): void {
    if (
        record.revision !== 0 ||
        record.status !== "uploaded" ||
        record.attemptCount !== 0 ||
        record.lease ||
        record.lastFailure ||
        record.policyDigest ||
        record.admissionInputDigest ||
        record.compatibilityReportDigest ||
        record.statefulChangeSelectionDigest ||
        record.verificationJobResultDigest ||
        record.updatedAt !== record.createdAt
    ) {
        corrupt(`Candidate ${record.candidateId} has an invalid initial revision`);
    }
}

export function assertCandidateRecordFollows(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): void {
    assertStableIdentity(previous, current);
    if (current.revision !== previous.revision + 1 || Date.parse(current.updatedAt) < Date.parse(previous.updatedAt)) {
        corrupt(`Candidate ${current.candidateId} revision chain is not monotonic`);
    }
    const transition = `${previous.status}->${current.status}`;
    switch (transition) {
        case "uploaded->validating":
            assertRecordDelta(previous, current, ["revision", "status", "updatedAt"]);
            return;
        case "validating->queued":
            assertQueuedPlan(previous, current);
            return;
        case "queued->running":
            assertClaim(previous, current);
            return;
        case "running->running":
            assertRenewal(previous, current);
            return;
        case "running->passed":
        case "running->rejected":
            assertCompletion(previous, current, false);
            return;
        case "running->queued":
            if (current.verificationJobResultDigest !== previous.verificationJobResultDigest) {
                assertCompletion(previous, current, true);
            } else {
                assertLeaseRecovery(previous, current);
            }
            return;
        case "uploaded->expired":
        case "validating->expired":
        case "queued->expired":
            assertRecordDelta(previous, current, ["revision", "status", "updatedAt"]);
            return;
        case "validating->rejected":
            assertValidationRejection(previous, current);
            return;
        default:
            corrupt(`Candidate ${current.candidateId} has forbidden transition ${transition}`);
    }
}

function assertQueuedPlan(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): void {
    if (!current.policyDigest || !current.admissionInputDigest || current.verificationJobResultDigest) {
        corrupt(`Candidate ${current.candidateId} queued without a fresh exact admission plan`);
    }
    assertRecordDelta(previous, current, [
        "revision",
        "status",
        "updatedAt",
        "policyDigest",
        "admissionInputDigest",
        "compatibilityReportDigest",
        "statefulChangeSelectionDigest",
    ]);
}

function assertValidationRejection(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): void {
    if (current.lastFailure?.kind !== "validation") {
        corrupt(`Candidate ${current.candidateId} validation rejection has no validation failure`);
    }
    assertRecordDelta(previous, current, ["revision", "status", "updatedAt", "lastFailure"]);
}
