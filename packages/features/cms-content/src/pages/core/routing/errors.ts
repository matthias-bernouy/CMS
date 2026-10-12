import type { PageReference } from "cms-content/pages/interfaces/routing";

export class PageRouteAlreadyRegisteredError extends Error {
    constructor() {
        super("The Page already has a registered route.");
        this.name = "PageRouteAlreadyRegisteredError";
    }
}

export class PageRouteCollisionError extends Error {
    constructor(readonly path: string) {
        super(`The Page route '${path}' is already used.`);
        this.name = "PageRouteCollisionError";
    }
}

export class PageRouteNotFoundError extends Error {
    constructor(readonly page: PageReference) {
        super("The Page route was not found.");
        this.name = "PageRouteNotFoundError";
    }
}

export class PageRouteRevisionConflictError extends Error {
    constructor(
        readonly expectedRevision: number,
        readonly actualRevision: number,
    ) {
        super(`The Page route revision is ${actualRevision}, not ${expectedRevision}.`);
        this.name = "PageRouteRevisionConflictError";
    }
}
