export class TemplateError extends Error {
    constructor(
        readonly code:
            | "INVALID_INPUT"
            | "NOT_FOUND"
            | "REVISION_CONFLICT"
            | "CAPACITY_EXCEEDED"
            | "ARCHIVED"
            | "CORE_UNAVAILABLE",
    ) {
        super(code);
    }
}
export function invalid(): never {
    throw new TemplateError("INVALID_INPUT");
}
