export class IntegrationRegistryStablePromotionNotFoundError extends Error {
    readonly status = 404;
    readonly code = "integration_registry_stable_promotion_not_found";

    constructor(
        readonly kind: string,
        readonly version: string,
    ) {
        super(`Integration version cannot be promoted because it was not found: ${kind}@${version}`);
        this.name = "IntegrationRegistryStablePromotionNotFoundError";
    }
}

export class IntegrationRegistryStablePromotionStaleReportError extends Error {
    readonly status = 409;
    readonly code = "integration_registry_stable_promotion_stale_report";

    constructor(
        readonly requestedReportRevisionId: string,
        readonly currentReportRevisionId: string,
    ) {
        super(`Stable promotion report revision is stale: expected current revision "${currentReportRevisionId}"`);
        this.name = "IntegrationRegistryStablePromotionStaleReportError";
    }
}

export class IntegrationRegistryStablePromotionConflictError extends Error {
    readonly status = 409;
    readonly code = "integration_registry_stable_promotion_conflict";

    constructor(
        readonly kind: string,
        readonly version: string,
        message = `Integration version is already stable: ${kind}@${version}`,
    ) {
        super(message);
        this.name = "IntegrationRegistryStablePromotionConflictError";
    }
}

export class IntegrationRegistryStablePromotionIneligibleError extends Error {
    readonly status = 422;
    readonly code = "integration_registry_stable_promotion_ineligible";

    constructor(
        readonly kind: string,
        readonly version: string,
        readonly reportRevisionId: string,
        message: string,
    ) {
        super(message);
        this.name = "IntegrationRegistryStablePromotionIneligibleError";
    }
}

export class IntegrationRegistryStablePromotionConfirmationError extends Error {
    readonly status = 422;
    readonly code = "integration_registry_stable_promotion_confirmation_required";

    constructor() {
        super("Stable promotion confirmation must repeat the exact target version and report revision ID");
        this.name = "IntegrationRegistryStablePromotionConfirmationError";
    }
}

export class IntegrationRegistryStablePromotionValidationError extends Error {
    readonly status = 422;
    readonly code = "integration_registry_stable_promotion_invalid";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "IntegrationRegistryStablePromotionValidationError";
    }
}
