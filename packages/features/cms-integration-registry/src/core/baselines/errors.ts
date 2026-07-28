export type ReviewedSchemaBaselineImportErrorCode =
    | "reviewed_schema_baseline_import_invalid"
    | "reviewed_schema_baseline_import_not_found"
    | "reviewed_schema_baseline_import_conflict"
    | "reviewed_schema_baseline_import_unapproved"
    | "reviewed_schema_baseline_import_recovery_required";

export class ReviewedSchemaBaselineImportError extends Error {
    constructor(
        readonly status: 404 | 409 | 422 | 503,
        readonly code: ReviewedSchemaBaselineImportErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "ReviewedSchemaBaselineImportError";
    }
}
