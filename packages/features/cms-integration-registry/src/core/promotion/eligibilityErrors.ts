export class IntegrationRegistryVersionEligibilityNotFoundError extends Error {
    readonly status = 404;
    readonly code = "integration_registry_version_eligibility_not_found";

    constructor(kind: string, version: string) {
        super(`Integration version or release decision was not found: ${kind}@${version}`);
        this.name = "IntegrationRegistryVersionEligibilityNotFoundError";
    }
}

export class IntegrationRegistryVersionEligibilityStaleDecisionError extends Error {
    readonly status = 409;
    readonly code = "integration_registry_version_eligibility_stale_decision";

    constructor() {
        super("Version eligibility mutation requires the exact current release decision revision and digest");
        this.name = "IntegrationRegistryVersionEligibilityStaleDecisionError";
    }
}

export class IntegrationRegistryVersionEligibilityConflictError extends Error {
    readonly status = 409;
    readonly code = "integration_registry_version_eligibility_conflict";

    constructor(message: string) {
        super(message);
        this.name = "IntegrationRegistryVersionEligibilityConflictError";
    }
}

export class IntegrationRegistryVersionEligibilityIneligibleError extends Error {
    readonly status = 422;
    readonly code = "integration_registry_version_eligibility_ineligible";

    constructor(message: string) {
        super(message);
        this.name = "IntegrationRegistryVersionEligibilityIneligibleError";
    }
}

export class IntegrationRegistryVersionEligibilityConfirmationError extends Error {
    readonly status = 422;
    readonly code = "integration_registry_version_eligibility_confirmation_required";

    constructor() {
        super("Version block confirmation must repeat the exact action, target, decision revision, and digest");
        this.name = "IntegrationRegistryVersionEligibilityConfirmationError";
    }
}

export class IntegrationRegistryVersionEligibilityValidationError extends Error {
    readonly status = 422;
    readonly code = "integration_registry_version_eligibility_invalid";

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "IntegrationRegistryVersionEligibilityValidationError";
    }
}
