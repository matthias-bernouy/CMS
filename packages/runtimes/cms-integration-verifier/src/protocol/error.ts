export type VerificationProtocolErrorKind = "transport" | "timeout" | "http" | "invalid-response";

const SAFE_ERROR_CODES = new Set([
    "candidate_request_too_large",
    "candidate_request_invalid",
    "candidate_not_found",
    "candidate_exists",
    "revision_conflict",
    "invalid_transition",
    "lease_conflict",
    "lease_expired",
    "invalid_candidate",
    "candidate_store_unavailable",
    "candidate_operation_failed",
    "worker_capability_unauthorized",
    "worker_attempt_conflict",
    "worker_unauthorized",
    "worker_rate_limited",
    "worker_protection_unavailable",
]);

export class VerificationProtocolError extends Error {
    override readonly name = "VerificationProtocolError";

    constructor(
        readonly kind: VerificationProtocolErrorKind,
        message: string,
        readonly retryable: boolean,
        readonly status?: number,
        readonly code?: string,
    ) {
        super(message);
    }
}

export function safeVerificationProtocolErrorCode(value: string): string | undefined {
    return SAFE_ERROR_CODES.has(value) ? value : undefined;
}
