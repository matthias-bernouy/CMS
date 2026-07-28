import { IntegrationRegistryCandidateError } from "@bernouy/cms-integration-registry";
import { IntegrationVerificationContractError } from "@bernouy/cms-integration-verification";
import { candidateBodyStatus } from "./body";

const JSON_HEADERS = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
};

export function candidateJsonResponse(status: number, body: Readonly<Record<string, unknown>>): Response {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function candidateProtocolErrorResponse(error: unknown): Response {
    const bodyStatus = candidateBodyStatus(error);
    if (bodyStatus) {
        return candidateError(
            bodyStatus,
            bodyStatus === 413 ? "candidate_request_too_large" : "candidate_request_invalid",
            bodyStatus === 413 ? "Candidate request is too large" : "Candidate request is invalid",
        );
    }
    if (error instanceof IntegrationVerificationContractError) {
        return candidateError(
            error.code === "limit_exceeded" ? 413 : 400,
            error.code === "limit_exceeded" ? "candidate_request_too_large" : "candidate_request_invalid",
            error.code === "limit_exceeded" ? "Candidate request is too large" : "Candidate request is invalid",
        );
    }
    const code = candidateErrorCode(error);
    switch (code) {
        case "candidate_not_found":
            return candidateError(404, code, "Candidate was not found");
        case "candidate_exists":
        case "revision_conflict":
        case "invalid_transition":
        case "lease_conflict":
            return candidateError(409, code, "Candidate state changed; reload and retry");
        case "lease_expired":
            return candidateError(410, code, "Candidate worker lease expired");
        case "invalid_candidate":
            return candidateError(422, code, "Candidate state transition is invalid");
        case "candidate_not_ready":
            return candidateError(409, code, "Candidate is not ready for publication");
        case "admission_rejected":
            return candidateError(422, code, "Candidate release admission was rejected");
        case "admission_stale":
            return candidateError(409, code, "Candidate admission inputs changed; submit a new candidate");
        case "publication_recovery_required":
            return candidateError(503, code, "Candidate publication requires recovery");
        case "inventory_limit":
        case "corrupt_candidate":
        case "legacy_candidate":
        case "mutation_locked":
            return candidateError(503, "candidate_store_unavailable", "Candidate storage is unavailable");
        default:
            return candidateError(500, "candidate_operation_failed", "Candidate operation failed");
    }
}

export function workerCapabilityUnauthorized(): Response {
    return candidateError(401, "worker_capability_unauthorized", "Worker capability is invalid or expired", {
        "www-authenticate": 'Bearer realm="cms-repository-verification-job"',
    });
}

export function workerAttemptConflict(): Response {
    return candidateError(409, "worker_attempt_conflict", "Worker result does not match its fenced capability");
}

export function workerUnauthorized(): Response {
    return candidateError(401, "worker_unauthorized", "Repository worker authentication is required", {
        "www-authenticate": 'Bearer realm="cms-repository-worker"',
    });
}

export function workerRateLimited(retryAfterSeconds: number): Response {
    const retryAfter = Number.isFinite(retryAfterSeconds) ? Math.max(1, Math.ceil(retryAfterSeconds)) : 1;
    return candidateError(429, "worker_rate_limited", "Repository worker rate limit exceeded", {
        "retry-after": String(retryAfter),
    });
}

export function workerProtectionUnavailable(): Response {
    return candidateError(503, "worker_protection_unavailable", "Repository worker protection is unavailable");
}

function candidateError(status: number, code: string, error: string, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify({ error, code }), {
        status,
        headers: { ...JSON_HEADERS, ...headers },
    });
}

function candidateErrorCode(error: unknown): string | undefined {
    if (error instanceof IntegrationRegistryCandidateError) {
        return error.code;
    }
    if (!error || typeof error !== "object") {
        return undefined;
    }
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}
