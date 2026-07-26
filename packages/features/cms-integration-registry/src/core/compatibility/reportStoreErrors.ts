export class IntegrationCompatibilityHistoryNotFoundError extends Error {
    readonly status = 404;
    readonly code = "integration_compatibility_history_not_found";

    constructor(
        readonly kind: string,
        readonly version: string,
    ) {
        super(`Integration compatibility history was not found: ${kind}@${version}`);
        this.name = "IntegrationCompatibilityHistoryNotFoundError";
    }
}

export class IntegrationCompatibilityRevisionConflictError extends Error {
    readonly status = 409;
    readonly code = "integration_compatibility_revision_conflict";

    constructor(
        readonly reportId: string,
        message?: string,
    ) {
        super(message ?? `Integration compatibility report ID already exists: ${reportId}`);
        this.name = "IntegrationCompatibilityRevisionConflictError";
    }
}

export class IntegrationCompatibilityRevisionValidationError extends Error {
    readonly status = 422;
    readonly code = "integration_compatibility_revision_invalid";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "IntegrationCompatibilityRevisionValidationError";
    }
}

export class ReviewedSchemaBaselineConflictError extends Error {
    readonly code = "reviewed_schema_baseline_conflict";

    constructor(message: string) {
        super(message);
        this.name = "ReviewedSchemaBaselineConflictError";
    }
}

export class ReviewedSchemaBaselineIntegrityError extends Error {
    readonly code = "reviewed_schema_baseline_integrity_error";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ReviewedSchemaBaselineIntegrityError";
    }
}

export class ReviewedSchemaBaselineValidationError extends Error {
    readonly code = "reviewed_schema_baseline_invalid";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ReviewedSchemaBaselineValidationError";
    }
}

export class IntegrationCompatibilityHistoryCursorError extends Error {
    readonly status = 400;
    readonly code = "integration_compatibility_history_cursor_invalid";

    constructor(message: string) {
        super(message);
        this.name = "IntegrationCompatibilityHistoryCursorError";
    }
}

export class ReleaseReportConflictError extends Error {
    readonly code = "integration_release_report_conflict";

    constructor(message: string) {
        super(message);
        this.name = "ReleaseReportConflictError";
    }
}

export class ReleaseReportIntegrityError extends Error {
    readonly code = "integration_release_report_integrity_error";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ReleaseReportIntegrityError";
    }
}

export class ReleaseReportValidationError extends Error {
    readonly code = "integration_release_report_invalid";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ReleaseReportValidationError";
    }
}

export class ReleaseAdmissionDecisionStaleError extends Error {
    readonly code = "integration_release_admission_decision_stale";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ReleaseAdmissionDecisionStaleError";
    }
}
