import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { assertRecordDelta, corrupt } from "./shared";

export function assertClaim(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): void {
    if (
        !current.lease ||
        current.attemptCount !== previous.attemptCount + 1 ||
        current.lease.fencingToken !== current.attemptCount ||
        current.lease.claimedAt !== current.updatedAt
    ) {
        corrupt(`Candidate ${current.candidateId} claim has invalid fencing or lease state`);
    }
    assertRecordDelta(previous, current, ["revision", "status", "updatedAt", "attemptCount", "lease"]);
}

export function assertRenewal(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): void {
    if (
        !previous.lease ||
        !current.lease ||
        current.lease.jobId !== previous.lease.jobId ||
        current.lease.attemptId !== previous.lease.attemptId ||
        current.lease.fencingToken !== previous.lease.fencingToken ||
        current.lease.workerId !== previous.lease.workerId ||
        current.lease.claimedAt !== previous.lease.claimedAt ||
        Date.parse(current.lease.leaseExpiresAt) <= Date.parse(previous.lease.leaseExpiresAt)
    ) {
        corrupt(`Candidate ${current.candidateId} lease renewal changed immutable claim identity`);
    }
    assertRecordDelta(previous, current, ["revision", "updatedAt", "lease"]);
}

export function assertCompletion(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
    retry: boolean,
): void {
    if (
        !previous.lease ||
        current.lease ||
        !current.verificationJobResultDigest ||
        current.verificationJobResultDigest === previous.verificationJobResultDigest
    ) {
        corrupt(`Candidate ${current.candidateId} completion has no fresh immutable result`);
    }
    if (current.status === "passed" && current.lastFailure) {
        corrupt(`Candidate ${current.candidateId} passed with a failure`);
    }
    if (current.status === "rejected" && !current.lastFailure) {
        corrupt(`Candidate ${current.candidateId} rejection has no server-derived failure`);
    }
    if (retry && current.lastFailure?.kind !== "infrastructure") {
        corrupt(`Candidate ${current.candidateId} retry has no infrastructure failure`);
    }
    assertRecordDelta(previous, current, [
        "revision",
        "status",
        "updatedAt",
        "lease",
        "lastFailure",
        "verificationJobResultDigest",
    ]);
}

export function assertLeaseRecovery(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): void {
    if (
        !previous.lease ||
        current.lease ||
        current.lastFailure?.kind !== "infrastructure" ||
        current.lastFailure.code !== "lease_expired" ||
        Date.parse(current.updatedAt) < Date.parse(previous.lease.leaseExpiresAt)
    ) {
        corrupt(`Candidate ${current.candidateId} lease recovery is invalid`);
    }
    assertRecordDelta(previous, current, ["revision", "status", "updatedAt", "lease", "lastFailure"]);
}
