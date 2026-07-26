export class IntegrationCompatibilityReevaluationNotFoundError extends Error {
    readonly status = 404;
    readonly code = "integration_compatibility_reevaluation_not_found";

    constructor(
        readonly kind: string,
        readonly version: string,
    ) {
        super(`Integration compatibility history was not found: ${kind}@${version}`);
        this.name = "IntegrationCompatibilityReevaluationNotFoundError";
    }
}

export class IntegrationCompatibilityReevaluationStaleReportError extends Error {
    readonly status = 409;
    readonly code = "integration_compatibility_reevaluation_stale_report";

    constructor(
        readonly requestedReportRevisionId: string,
        readonly currentReportRevisionId: string,
    ) {
        super(`Compatibility reevaluation report revision is stale: expected "${currentReportRevisionId}"`);
        this.name = "IntegrationCompatibilityReevaluationStaleReportError";
    }
}

export class IntegrationCompatibilityReevaluationStaleDecisionError extends Error {
    readonly status = 409;
    readonly code = "integration_compatibility_reevaluation_stale_decision";

    constructor(
        readonly currentDecisionRevisionId: string,
        readonly currentDecisionDigest: string,
    ) {
        super(`Compatibility reevaluation release decision is stale: expected "${currentDecisionRevisionId}"`);
        this.name = "IntegrationCompatibilityReevaluationStaleDecisionError";
    }
}

export class IntegrationCompatibilityReevaluationConflictError extends Error {
    readonly status = 409;
    readonly code = "integration_compatibility_reevaluation_conflict";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "IntegrationCompatibilityReevaluationConflictError";
    }
}

export class IntegrationCompatibilityReevaluationIntegrityError extends Error {
    readonly status = 409;
    readonly code = "integration_compatibility_reevaluation_integrity_conflict";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "IntegrationCompatibilityReevaluationIntegrityError";
    }
}

export class IntegrationCompatibilityReevaluationValidationError extends Error {
    readonly status = 422;
    readonly code = "integration_compatibility_reevaluation_invalid";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "IntegrationCompatibilityReevaluationValidationError";
    }
}
