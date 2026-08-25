/**
 * Domain errors of the content aggregate. They carry a `status` so any HTTP
 * surface maps them without importing surface-specific error classes — the
 * runner turns a thrown `.status` into the response code.
 */
export class ContentValidationError extends Error {
    status = 400;
    constructor(
        readonly field: string,
        message: string,
    ) {
        super(`Invalid ${field}: ${message}`);
        this.name = "ContentValidationError";
    }
}

export class ContentConflictError extends Error {
    status = 409;
    constructor(message: string) {
        super(message);
        this.name = "ContentConflictError";
    }
}

export class DuplicateBlocTagError extends ContentConflictError {
    constructor(tag: string) {
        super(`Bloc with tag "${tag}" already exists`);
        this.name = "DuplicateBlocTagError";
    }
}

export class DuplicatePagePathError extends ContentConflictError {
    readonly field = "path";
    readonly publicCode = "page_path_taken";

    constructor(readonly path: string) {
        super("A page already uses this path.");
        this.name = "DuplicatePagePathError";
    }
}

export class BlocOwnershipConflictError extends ContentConflictError {
    constructor(tag: string) {
        super(`Bloc with tag "${tag}" belongs to a different owner`);
        this.name = "BlocOwnershipConflictError";
    }
}

export class BlocRevisionConflictError extends ContentConflictError {
    constructor(
        tag: string,
        readonly expectedRevision: number,
        readonly actualRevision: number,
    ) {
        super(`Bloc "${tag}" draft revision changed (expected ${expectedRevision}, current ${actualRevision})`);
        this.name = "BlocRevisionConflictError";
    }
}

export class BlocLifecycleConflictError extends ContentConflictError {
    constructor(
        tag: string,
        readonly expectedLifecycle: "active" | "archived",
        readonly actualLifecycle: "active" | "archived",
    ) {
        super(`Bloc "${tag}" lifecycle changed (expected ${expectedLifecycle}, current ${actualLifecycle})`);
        this.name = "BlocLifecycleConflictError";
    }
}

export class BlocPublicationConflictError extends ContentConflictError {
    constructor(
        tag: string,
        readonly expectedRevision: number | null,
        readonly actualRevision: number | null,
    ) {
        super(`Bloc "${tag}" publication changed while the operation was in progress`);
        this.name = "BlocPublicationConflictError";
    }
}

export class SiteBlocLifecycleConflictError extends ContentConflictError {
    constructor(tag: string, operation: string) {
        super(`Cannot ${operation} archived site bloc "${tag}"`);
        this.name = "SiteBlocLifecycleConflictError";
    }
}

export class SiteBlocPublishedSlotConflictError extends ContentConflictError {
    constructor(tag: string, slotId: string, reason: "removed" | "renamed") {
        super(`Cannot save site bloc "${tag}": published slot "${slotId}" was ${reason}`);
        this.name = "SiteBlocPublishedSlotConflictError";
    }
}

export class SiteBlocPublicationRequiredError extends ContentConflictError {
    constructor(tag: string) {
        super(`Site-builder bloc "${tag}" must be written through publishSiteBloc`);
        this.name = "SiteBlocPublicationRequiredError";
    }
}

export class SiteBlocPublicationLockLostError extends ContentConflictError {
    constructor() {
        super("The site bloc publication graph changed while the operation was in progress");
        this.name = "SiteBlocPublicationLockLostError";
    }
}

export class SiteBlocPublicationRecoveryRequiredError extends Error {
    status = 503;

    constructor() {
        super("A site bloc publication stopped during persistence; manual lock recovery is required");
        this.name = "SiteBlocPublicationRecoveryRequiredError";
    }
}

export class SiteBlocNotFoundError extends Error {
    status = 404;

    constructor(tag: string) {
        super(`Site bloc "${tag}" was not found`);
        this.name = "SiteBlocNotFoundError";
    }
}
