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
    constructor(message: string, readonly status = 500) {
        super(message);
        this.name = "IntegrationRuntimeError";
    }
}

export class DuplicateIntegrationInstanceError extends Error {
    status = 409;
    constructor(id: string) {
        super(`Integration instance already exists: ${id}`);
        this.name = "DuplicateIntegrationInstanceError";
    }
}

export class MissingIntegrationInstanceError extends Error {
    status = 404;
    constructor(id: string) {
        super(`Integration instance not found: ${id}`);
        this.name = "MissingIntegrationInstanceError";
    }
}
