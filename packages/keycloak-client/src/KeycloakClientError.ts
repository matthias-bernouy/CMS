export type KeycloakClientErrorCode =
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "validation_error"
    | "unknown";

/**
 * Thrown by every `KeycloakAdminClient` method on non-2xx HTTP responses.
 * Code is mapped from HTTP status (409 → conflict, 404 → not_found, etc.) so
 * the orchestrator (e.g. the central hub) can do `if (e.code === "conflict") continue`.
 */
export class KeycloakClientError extends Error {
    constructor(
        public readonly code:       KeycloakClientErrorCode,
        message:                    string,
        public readonly httpStatus: number,
    ) {
        super(message);
        this.name = "KeycloakClientError";
    }
}
