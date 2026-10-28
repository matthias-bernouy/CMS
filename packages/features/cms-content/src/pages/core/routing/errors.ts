import { ContentConflictError } from "cms-content/application/core/validation/errors";
import type { PageReference } from "cms-content/pages/interfaces/routing";
export class PageRouteNotFoundError extends Error {
    constructor(readonly page: PageReference) {
        super("The Page route was not found.");
        this.name = "PageRouteNotFoundError";
    }
}

export class PageReferencedError extends ContentConflictError {
    constructor(readonly pageId: string) {
        super("A Page cannot be deleted while another Page references it");
        this.name = "PageReferencedError";
    }
}
