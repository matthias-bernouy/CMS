export class IntegrationPackageRepositoryError extends Error {
    constructor(
        message: string,
        readonly status: 502 | 503,
        readonly publicCode: string,
    ) {
        super(message);
        this.name = "IntegrationPackageRepositoryError";
    }
}

export class IntegrationPackageRepositoryUnavailableError extends IntegrationPackageRepositoryError {
    constructor() {
        super("Integration repository is unavailable", 503, "integration_repository_unavailable");
        this.name = "IntegrationPackageRepositoryUnavailableError";
    }
}

export class IntegrationPackageRepositoryContractError extends IntegrationPackageRepositoryError {
    constructor() {
        super(
            "Integration repository returned an invalid package response",
            502,
            "integration_repository_invalid_response",
        );
        this.name = "IntegrationPackageRepositoryContractError";
    }
}
