/** Thrown when a source write breaks a source-domain rule. Carries `.status`
 *  so any HTTP surface maps it to a 400 without importing surface errors. */
export class SourceValidationError extends Error {
    status = 400;
    constructor(field: string, message: string) {
        super(`Invalid ${field}: ${message}`);
        this.name = "SourceValidationError";
    }
}

export class DuplicateSourceError extends Error {
    status = 400;
    constructor(urn: string) {
        super(`Source with urn "${urn}" already exists`);
        this.name = "DuplicateSourceError";
    }
}
