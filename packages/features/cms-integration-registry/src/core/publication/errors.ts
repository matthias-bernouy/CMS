export class IntegrationRegistryVersionConflictError extends Error {
    readonly status = 409;
    readonly code = "integration_version_exists";

    constructor(
        readonly kind: string,
        readonly version: string,
    ) {
        super(`Integration version already exists: ${kind}@${version}`);
        this.name = "IntegrationRegistryVersionConflictError";
    }
}

export class IntegrationRegistryVersionOrderError extends Error {
    readonly status = 409;
    readonly code = "integration_version_not_newer";

    constructor(
        readonly kind: string,
        readonly version: string,
        readonly latest: string,
    ) {
        super(`Integration version ${kind}@${version} must be strictly newer than current latest ${latest}`);
        this.name = "IntegrationRegistryVersionOrderError";
    }
}

export class IntegrationRegistryVerificationRequiredError extends Error {
    readonly status = 422;
    readonly code = "verification_required";

    constructor(
        readonly kind: string,
        readonly version: string,
        readonly packageDigest: string,
    ) {
        super(`Integration publication requires an exact admissible verification decision: ${kind}@${version}`);
        this.name = "IntegrationRegistryVerificationRequiredError";
    }
}
