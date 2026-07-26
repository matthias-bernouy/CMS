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

export class IntegrationCompatibilityHistoryCursorError extends Error {
    readonly status = 400;
    readonly code = "integration_compatibility_history_cursor_invalid";

    constructor(message: string) {
        super(message);
        this.name = "IntegrationCompatibilityHistoryCursorError";
    }
}
