/**
 * Domain errors of the roles & permissions feature. They carry a `status`
 * so any HTTP surface maps them without importing surface-specific error
 * classes — the runner turns a thrown `.status` into the response code.
 */
export class RoleValidationError extends Error {
    status = 400;
    constructor(field: string, message: string) {
        super(`Invalid ${field}: ${message}`);
        this.name = "RoleValidationError";
    }
}

export class RoleConflictError extends Error {
    status = 409;
    constructor(message: string) {
        super(message);
        this.name = "RoleConflictError";
    }
}
