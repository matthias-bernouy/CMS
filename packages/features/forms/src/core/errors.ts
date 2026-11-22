export class FormsError extends Error {
    constructor(
        readonly code:
            | "INVALID_INPUT"
            | "FORM_NOT_FOUND"
            | "REVISION_CONFLICT"
            | "IDEMPOTENCY_CONFLICT"
            | "FORM_CLOSED"
            | "VERSION_CONFLICT"
            | "SUBMISSION_NOT_ALLOWED"
            | "SUBMISSION_GONE"
            | "EMAILER_UNAVAILABLE"
            | "RATE_LIMITED"
            | "CORE_UNAVAILABLE",
    ) {
        super(code);
    }
}
