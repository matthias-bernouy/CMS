export class ZipValidationError extends TypeError {
    constructor(
        readonly code:
            | "invalid_archive"
            | "unsupported_entry"
            | "invalid_path"
            | "limit_exceeded"
            | "integrity_mismatch",
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}
