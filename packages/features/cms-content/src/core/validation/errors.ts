/**
 * Domain errors of the content aggregate. They carry a `status` so any HTTP
 * surface maps them without importing surface-specific error classes — the
 * runner turns a thrown `.status` into the response code.
 */
export class ContentValidationError extends Error {
    status = 400;
    constructor(field: string, message: string) {
        super(`Invalid ${field}: ${message}`);
        this.name = "ContentValidationError";
    }
}

export class ContentConflictError extends Error {
    status = 409;
    constructor(message: string) {
        super(message);
        this.name = "ContentConflictError";
    }
}

export class DuplicateBlocTagError extends ContentConflictError {
    constructor(tag: string) {
        super(`Bloc with tag "${tag}" already exists`);
        this.name = "DuplicateBlocTagError";
    }
}
