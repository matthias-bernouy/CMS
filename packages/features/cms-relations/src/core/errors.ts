export class DuplicateRelationError extends Error {
    constructor(readonly id: string) {
        super(`relation already exists: ${id}`);
    }
}

export class DuplicateDashboardRelationProjectionError extends Error {
    constructor(readonly id: string) {
        super(`dashboard relation projection already exists: ${id}`);
    }
}

export class RelationValidationError extends Error {
    constructor(readonly errors: string[]) {
        super(errors.join("; "));
    }
}

export class RelationResolutionError extends Error {
    constructor(
        message: string,
        readonly status = 500,
    ) {
        super(message);
    }
}
