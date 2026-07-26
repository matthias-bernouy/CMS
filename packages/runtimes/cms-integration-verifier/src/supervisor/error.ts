export type VerificationSupervisorErrorCode =
    | "already-running"
    | "aborted"
    | "database-unavailable"
    | "invalid-database-credential"
    | "runner-mismatch"
    | "sandbox-failed"
    | "sandbox-result-invalid"
    | "lease-lost"
    | "capability-invalid"
    | "database-release-failed";

export class VerificationSupervisorError extends Error {
    override readonly name = "VerificationSupervisorError";

    constructor(
        readonly code: VerificationSupervisorErrorCode,
        message: string,
        readonly retryable: boolean,
    ) {
        super(message);
    }
}
