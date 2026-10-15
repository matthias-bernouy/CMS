import {
    PageRouteAlreadyRegisteredError,
    PageRouteCollisionError,
    PageRouteNotFoundError,
    PageRouteRevisionConflictError,
} from "cms-content/pages/core/routing/errors";
import {
    clonePageRoute,
    nextPageRoute,
    pageRouteClaims,
    pageScopeKey,
    scopedPageRouteKey,
    validatePageReference,
    validateRegisteredPagePath,
    validateSiteId,
} from "cms-content/pages/core/routing/values";
import type {
    PageReference,
    PageRouteRegistration,
    PageRouteRegistry,
    RegisteredPageRoute,
} from "cms-content/pages/interfaces/routing";

export class InMemoryPageRouteRegistry implements PageRouteRegistry {
    readonly #byPage = new Map<string, RegisteredPageRoute>();
    readonly #byClaim = new Map<string, string>();

    async register(siteId: string, input: PageRouteRegistration): Promise<RegisteredPageRoute> {
        validateSiteId(siteId);
        const page = validatePageReference(input.page);
        const pageKey = pageScopeKey(siteId, page);
        if (this.#byPage.has(pageKey)) {
            throw new PageRouteAlreadyRegisteredError();
        }
        const path = validateRegisteredPagePath(input.defaultPath);
        this.#assertClaimsAvailable(siteId, [path]);
        const route = { page, defaultPath: path, path, revision: 1 } as const;
        this.#byPage.set(pageKey, route);
        this.#setClaims(siteId, pageKey, route);
        return clonePageRoute(route);
    }

    async list(siteId: string): Promise<readonly RegisteredPageRoute[]> {
        const prefix = `${JSON.stringify([validateSiteId(siteId)]).slice(0, -1)},`;
        return [...this.#byPage.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([, route]) => clonePageRoute(route));
    }

    async get(siteId: string, page: PageReference): Promise<RegisteredPageRoute | null> {
        const route = this.#byPage.get(pageScopeKey(siteId, page));
        return route ? clonePageRoute(route) : null;
    }

    async resolve(siteId: string, path: string): Promise<RegisteredPageRoute | null> {
        const pageKey = this.#byClaim.get(scopedPageRouteKey(siteId, path));
        const route = pageKey ? this.#byPage.get(pageKey) : undefined;
        return route ? clonePageRoute(route) : null;
    }

    async resolveDefault(siteId: string, defaultPath: string): Promise<RegisteredPageRoute | null> {
        const path = validateRegisteredPagePath(defaultPath);
        return (await this.list(siteId)).find((route) => route.defaultPath === path) ?? null;
    }

    async updateDefault(
        siteId: string,
        page: PageReference,
        defaultPath: string,
        expectedRevision: number,
    ): Promise<RegisteredPageRoute> {
        return this.#replace(siteId, page, expectedRevision, { defaultPath });
    }

    async setOverride(
        siteId: string,
        page: PageReference,
        overridePath: string | null,
        expectedRevision: number,
    ): Promise<RegisteredPageRoute> {
        return this.#replace(siteId, page, expectedRevision, { overridePath });
    }

    async remove(siteId: string, page: PageReference, expectedRevision: number): Promise<void> {
        const current = this.#current(siteId, page, expectedRevision);
        const pageKey = pageScopeKey(siteId, page);
        this.#byPage.delete(pageKey);
        this.#deleteClaims(siteId, current);
    }

    #replace(
        siteId: string,
        page: PageReference,
        expectedRevision: number,
        change: { readonly defaultPath?: string; readonly overridePath?: string | null },
    ): RegisteredPageRoute {
        const current = this.#current(siteId, page, expectedRevision);
        const next = nextPageRoute(current, change);
        const pageKey = pageScopeKey(siteId, page);
        this.#assertClaimsAvailable(siteId, pageRouteClaims(next), pageKey);
        this.#deleteClaims(siteId, current);
        this.#setClaims(siteId, pageKey, next);
        this.#byPage.set(pageKey, next);
        return clonePageRoute(next);
    }

    #current(siteId: string, page: PageReference, expectedRevision: number): RegisteredPageRoute {
        const current = this.#byPage.get(pageScopeKey(siteId, page));
        if (!current) {
            throw new PageRouteNotFoundError(page);
        }
        if (current.revision !== expectedRevision) {
            throw new PageRouteRevisionConflictError(expectedRevision, current.revision);
        }
        return current;
    }

    #assertClaimsAvailable(siteId: string, paths: readonly string[], owner?: string): void {
        for (const path of paths) {
            const existing = this.#byClaim.get(scopedPageRouteKey(siteId, path));
            if (existing && existing !== owner) {
                throw new PageRouteCollisionError(path);
            }
        }
    }

    #deleteClaims(siteId: string, route: RegisteredPageRoute): void {
        for (const path of pageRouteClaims(route)) {
            this.#byClaim.delete(scopedPageRouteKey(siteId, path));
        }
    }

    #setClaims(siteId: string, pageKey: string, route: RegisteredPageRoute): void {
        for (const path of pageRouteClaims(route)) {
            this.#byClaim.set(scopedPageRouteKey(siteId, path), pageKey);
        }
    }
}
