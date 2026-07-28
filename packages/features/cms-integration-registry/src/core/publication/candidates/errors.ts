export class IntegrationRegistryCandidateError extends Error {
    override readonly name = "IntegrationRegistryCandidateError";

    constructor(
        readonly code:
            | "invalid_candidate"
            | "revision_conflict"
            | "invalid_transition"
            | "lease_conflict"
            | "lease_expired",
        message: string,
    ) {
        super(message);
    }
}
