import type { RepositoryManagementTransportResponse } from "../../transport";
import type { SanitizedRepositoryManagementResult } from "../errors";
import {
    assertEqual,
    canonicalText,
    digest,
    enumValue,
    exactObject,
    isoTimestamp,
    nonNegativeInteger,
    packageKind,
    packageVersion,
    positiveInteger,
    type JsonObject,
} from "../helpers";

export type CandidateIdentity = Readonly<{
    candidateDigest: string;
    packageDigest: string;
    verificationDigest: string;
    kind: string;
    version: string;
}>;

const STATUSES = [
    "uploaded",
    "validating",
    "queued",
    "running",
    "passed",
    "publishing",
    "published",
    "rejected",
    "expired",
] as const;

export function validateCandidateSubmissionResponse(
    response: RepositoryManagementTransportResponse,
    expected: CandidateIdentity,
): SanitizedRepositoryManagementResult {
    if (response.status !== 202) {
        return validateCandidateErrorResponse(response);
    }
    const body = exactObject(response.body, ["candidate"]);
    validateCandidateProjection(body.candidate, expected);
    return { status: 202, body };
}

export function validateCandidateStatusResponse(
    response: RepositoryManagementTransportResponse,
    candidateId: string,
): SanitizedRepositoryManagementResult {
    if (response.status !== 200) {
        return validateCandidateErrorResponse(response);
    }
    const body = exactObject(response.body, ["candidate"]);
    const candidate = validateCandidateProjection(body.candidate);
    assertEqual(candidate.candidateId, candidateId);
    return { status: 200, body };
}

export function validateCandidateProjection(value: unknown, expected?: CandidateIdentity): JsonObject {
    const candidate = exactObject(
        value,
        [
            "attemptCount",
            "candidateDigest",
            "candidateId",
            "createdAt",
            "expiresAt",
            "kind",
            "packageDigest",
            "revision",
            "status",
            "updatedAt",
            "verificationDigest",
            "version",
        ],
        ["lastFailure", "lease", "requestedChannel"],
    );
    candidateId(candidate.candidateId);
    nonNegativeInteger(candidate.revision);
    enumValue(candidate.status, STATUSES);
    const identity = {
        candidateDigest: digest(candidate.candidateDigest),
        packageDigest: digest(candidate.packageDigest),
        verificationDigest: digest(candidate.verificationDigest),
        kind: packageKind(candidate.kind),
        version: packageVersion(candidate.version),
    };
    if (expected) {
        for (const key of ["candidateDigest", "packageDigest", "verificationDigest", "kind", "version"] as const) {
            assertEqual(identity[key], expected[key]);
        }
    }
    isoTimestamp(candidate.createdAt);
    isoTimestamp(candidate.updatedAt);
    isoTimestamp(candidate.expiresAt);
    nonNegativeInteger(candidate.attemptCount);
    if (candidate.requestedChannel !== undefined) {
        assertEqual(candidate.requestedChannel, "latest");
    }
    if (candidate.lease !== undefined) {
        validateLease(candidate.lease);
    }
    if (candidate.lastFailure !== undefined) {
        validateFailure(candidate.lastFailure);
    }
    return candidate;
}

function validateLease(value: unknown): void {
    const lease = exactObject(value, ["attemptId", "claimedAt", "fencingToken", "jobId", "leaseExpiresAt", "workerId"]);
    candidateId(lease.attemptId);
    candidateId(lease.jobId);
    candidateId(lease.workerId);
    positiveInteger(lease.fencingToken);
    isoTimestamp(lease.claimedAt);
    isoTimestamp(lease.leaseExpiresAt);
}

function validateFailure(value: unknown): void {
    const failure = exactObject(value, ["code", "kind", "occurredAt"]);
    enumValue(failure.kind, ["validation", "suite", "infrastructure", "stale"] as const);
    canonicalText(failure.code, 512);
    isoTimestamp(failure.occurredAt);
}

export function validateCandidateErrorResponse(
    response: RepositoryManagementTransportResponse,
): SanitizedRepositoryManagementResult {
    const body = exactObject(response.body, ["code", "error"]);
    const code = canonicalText(body.code, 512);
    canonicalText(body.error, 2_048);
    const allowed = new Set([
        "candidate_request_invalid",
        "candidate_request_too_large",
        "candidate_not_found",
        "candidate_exists",
        "revision_conflict",
        "invalid_transition",
        "lease_conflict",
        "invalid_candidate",
        "admission_rejected",
        "admission_stale",
        "candidate_not_ready",
        "candidate_store_unavailable",
        "candidate_operation_failed",
        "publication_recovery_required",
    ]);
    if (!allowed.has(code) || ![400, 404, 409, 413, 422, 503].includes(response.status)) {
        throw new TypeError("Unexpected candidate protocol error");
    }
    return { status: response.status, body: { code, error: "Candidate operation failed" } };
}

function candidateId(value: unknown): string {
    const result = canonicalText(value, 128);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(result)) {
        throw new TypeError("Candidate identifier is invalid");
    }
    return result;
}
