export class IntegrationInputError extends Error {
    status = 400;
    constructor(field: string, message: string) {
        super(`Invalid param ${field}: ${message}`);
        this.name = "IntegrationInputError";
    }
}

export class MissingIntegrationParam extends Error {
    status = 400;
    constructor(field: string) {
        super(`Missing param ${field}`);
        this.name = "MissingIntegrationParam";
    }
}

export class IntegrationRuntimeError extends Error {
    constructor(
        message: string,
        readonly status = 500,
    ) {
        super(message);
        this.name = "IntegrationRuntimeError";
    }
}

export class IntegrationRepositoryError extends IntegrationRuntimeError {
    constructor(
        message: string,
        status: number,
        readonly publicCode: string,
    ) {
        super(message, status);
        this.name = "IntegrationRepositoryError";
    }
}

export class IntegrationRepositoryUnavailableError extends IntegrationRepositoryError {
    constructor() {
        super("Integration repository is unavailable", 503, "integration_repository_unavailable");
        this.name = "IntegrationRepositoryUnavailableError";
    }
}

export class IntegrationRepositoryContractError extends IntegrationRepositoryError {
    constructor() {
        super("Integration repository returned an invalid response", 502, "integration_repository_invalid_response");
        this.name = "IntegrationRepositoryContractError";
    }
}

export class MissingIntegrationPackageError extends IntegrationRuntimeError {
    readonly publicCode = "integration_package_not_found";

    constructor(
        readonly kind: string,
        readonly version: string,
    ) {
        super(`Integration package "${kind}" version "${version}" was not found`, 404);
        this.name = "MissingIntegrationPackageError";
    }
}

export class DuplicateIntegrationInstallationError extends Error {
    status = 409;
    constructor(id: string) {
        super(`Integration installation already exists: ${id}`);
        this.name = "DuplicateIntegrationInstallationError";
    }
}

export class MissingIntegrationInstallationError extends Error {
    status = 404;
    constructor(id: string) {
        super(`Integration installation not found: ${id}`);
        this.name = "MissingIntegrationInstallationError";
    }
}
