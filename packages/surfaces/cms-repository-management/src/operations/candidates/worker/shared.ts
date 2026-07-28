import type {
    IntegrationRegistryCandidateLease,
    IntegrationRegistryCandidateRecord,
} from "@bernouy/cms-integration-registry";
import { RepositoryCandidateRequestError } from "../body";
import type { RepositoryCandidateCapabilityIdentity } from "../contracts";

type LeaseIdentity = Pick<
    RepositoryCandidateCapabilityIdentity,
    "candidateId" | "jobId" | "attemptId" | "fencingToken" | "workerId"
> & { leaseExpiresAt?: string };

export function sameCandidateLease(
    lease: IntegrationRegistryCandidateLease | undefined,
    identity: LeaseIdentity,
): lease is IntegrationRegistryCandidateLease {
    return Boolean(
        lease &&
            lease.jobId === identity.jobId &&
            lease.attemptId === identity.attemptId &&
            lease.fencingToken === identity.fencingToken &&
            lease.workerId === identity.workerId &&
            (identity.leaseExpiresAt === undefined || lease.leaseExpiresAt === identity.leaseExpiresAt),
    );
}

export function resultCapabilityIdentity(
    record: IntegrationRegistryCandidateRecord | null,
    resultDigest: string,
): RepositoryCandidateCapabilityIdentity {
    if (!record?.lease) {
        throw new Error("Candidate claim did not persist a lease");
    }
    return Object.freeze({
        candidateId: record.candidateId,
        jobId: record.lease.jobId,
        attemptId: record.lease.attemptId,
        fencingToken: record.lease.fencingToken,
        workerId: record.lease.workerId,
        leaseExpiresAt: record.lease.leaseExpiresAt,
        resultDigest,
    });
}

export function resultMatchesCapability(
    result: Readonly<{ candidateId: string; jobId: string; attemptId: string; fencingToken: number }>,
    identity: RepositoryCandidateCapabilityIdentity,
): boolean {
    return (
        result.candidateId === identity.candidateId &&
        result.jobId === identity.jobId &&
        result.attemptId === identity.attemptId &&
        result.fencingToken === identity.fencingToken
    );
}

export function readWorkerListLimit(request: Request): number {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "limit") || params.getAll("limit").length > 1) {
        throw invalidListQuery();
    }
    const value = params.get("limit");
    if (value === null) {
        return 25;
    }
    if (!/^[1-9][0-9]*$/u.test(value)) {
        throw invalidListQuery();
    }
    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit > 100) {
        throw invalidListQuery();
    }
    return limit;
}

export function canonicalWorkerTimestamp(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError("Candidate worker clock must return a canonical timestamp");
    }
    return value;
}

export function addWorkerLeaseDuration(timestamp: string, duration: number, candidateExpiresAt?: string): string {
    const requested = Date.parse(timestamp) + duration;
    const candidateExpiry = candidateExpiresAt === undefined ? requested : Date.parse(candidateExpiresAt);
    const result = Math.min(requested, candidateExpiry);
    if (!Number.isSafeInteger(result)) {
        throw new TypeError("Candidate worker lease exceeds the supported timestamp range");
    }
    return new Date(result).toISOString();
}

function invalidListQuery(): RepositoryCandidateRequestError {
    return new RepositoryCandidateRequestError("Invalid candidate job list query");
}
