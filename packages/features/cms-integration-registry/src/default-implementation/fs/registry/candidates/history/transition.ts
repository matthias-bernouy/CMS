import { isDeepStrictEqual } from "node:util";
import {
    advanceIntegrationRegistryCandidate,
    claimIntegrationRegistryCandidate,
    completeIntegrationRegistryCandidateAttempt,
    renewIntegrationRegistryCandidateLease,
} from "cms-integration-registry/core/publication/candidates/state";
import { recoverExpiredIntegrationRegistryCandidateLease } from "cms-integration-registry/core/publication/candidates/recovery";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";

export function assertInitialCandidateRecord(record: IntegrationRegistryCandidateRecord): void {
    if (
        record.revision !== 0 ||
        record.status !== "uploaded" ||
        record.attemptCount !== 0 ||
        record.lease ||
        record.lastFailure ||
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
    let expected: IntegrationRegistryCandidateRecord;
    try {
        expected = reconstructTransition(previous, current);
    } catch (error) {
        corrupt(`Candidate ${current.candidateId} revision ${current.revision} is invalid: ${errorMessage(error)}`);
    }
    if (!isDeepStrictEqual(expected, current)) {
        corrupt(`Candidate ${current.candidateId} revision ${current.revision} is not a canonical state transition`);
    }
}

function reconstructTransition(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): IntegrationRegistryCandidateRecord {
    if (current.revision !== previous.revision + 1) {
        corrupt(`Candidate ${current.candidateId} revision chain is not contiguous`);
    }
    if (previous.status === "queued" && current.status === "running" && current.lease) {
        return claimIntegrationRegistryCandidate(previous, {
            expectedRevision: previous.revision,
            jobId: current.lease.jobId,
            attemptId: current.lease.attemptId,
            fencingToken: current.lease.fencingToken,
            workerId: current.lease.workerId,
            now: current.updatedAt,
            leaseExpiresAt: current.lease.leaseExpiresAt,
        });
    }
    if (previous.status === "running" && current.status === "running" && current.lease) {
        return renewIntegrationRegistryCandidateLease(previous, {
            expectedRevision: previous.revision,
            attemptId: current.lease.attemptId,
            fencingToken: current.lease.fencingToken,
            now: current.updatedAt,
            leaseExpiresAt: current.lease.leaseExpiresAt,
        });
    }
    if (previous.status === "running") {
        const recovered = tryReconstructLeaseRecovery(previous, current);
        if (recovered) {
            return recovered;
        }
        return completeIntegrationRegistryCandidateAttempt(previous, {
            expectedRevision: previous.revision,
            attemptId: previous.lease?.attemptId ?? "",
            fencingToken: previous.lease?.fencingToken ?? 0,
            now: current.updatedAt,
            outcome:
                current.status === "passed"
                    ? "passed"
                    : current.status === "rejected"
                      ? "rejected"
                      : "infrastructure-failure",
            ...(current.status === "passed" ? {} : { failure: current.lastFailure }),
        });
    }
    if (current.status === "uploaded" || current.status === "running" || current.status === "passed") {
        corrupt(`Candidate ${current.candidateId} has an invalid direct transition to ${current.status}`);
    }
    return advanceIntegrationRegistryCandidate(previous, {
        expectedRevision: previous.revision,
        status: current.status,
        now: current.updatedAt,
        ...(!isDeepStrictEqual(previous.lastFailure, current.lastFailure) ? { failure: current.lastFailure } : {}),
    });
}

function tryReconstructLeaseRecovery(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): IntegrationRegistryCandidateRecord | null {
    if (current.status !== "queued" || current.lastFailure?.code !== "lease_expired") {
        return null;
    }
    try {
        const recovered = recoverExpiredIntegrationRegistryCandidateLease(previous, {
            expectedRevision: previous.revision,
            now: current.updatedAt,
        });
        return isDeepStrictEqual(recovered, current) ? recovered : null;
    } catch {
        return null;
    }
}

function assertStableIdentity(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): void {
    for (const field of [
        "candidateId",
        "kind",
        "version",
        "packageDigest",
        "verificationDigest",
        "requestedChannel",
        "createdAt",
        "expiresAt",
    ] as const) {
        if (previous[field] !== current[field]) {
            corrupt(`Candidate ${current.candidateId} changed immutable field ${field}`);
        }
    }
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
