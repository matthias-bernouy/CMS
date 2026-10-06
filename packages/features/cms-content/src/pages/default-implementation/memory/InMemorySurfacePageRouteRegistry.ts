import {
    PageRouteAlreadyRegisteredError,
    PageRouteCollisionError,
    PageRouteNotFoundError,
    PageRouteRevisionConflictError,
} from "cms-content/pages/core/routing/errors";
import {
    cloneSurfacePageRoute,
    nextSurfacePageRoute,
    pageScopeKey,
    scopedPageRouteKey,
    validatePageReference,
    validateSiteId,
    validateSurfacePagePath,
} from "cms-content/pages/core/routing/values";
import type {
    PageReference,
    SurfacePageRoute,
    SurfacePageRouteRegistration,
    SurfacePageRouteRegistry,
} from "cms-content/pages/interfaces/routing";

export class InMemorySurfacePageRouteRegistry implements SurfacePageRouteRegistry {
    readonly #byPage = new Map<string, SurfacePageRoute>();
    readonly #byRoute = new Map<string, string>();

    async register(siteId: string, input: SurfacePageRouteRegistration): Promise<SurfacePageRoute> {
        validateSiteId(siteId);
        const page = validatePageReference(input.page);
        const pageKey = pageScopeKey(siteId, page);
        if (this.#byPage.has(pageKey)) {
            throw new PageRouteAlreadyRegisteredError();
        }
        const path = validateSurfacePagePath(input.surface, input.defaultPath);
        this.#assertAvailable(siteId, input.surface, path);
        const route = { page, surface: input.surface, defaultPath: path, path, revision: 1 } as const;
        this.#byPage.set(pageKey, route);
        this.#byRoute.set(scopedPageRouteKey(siteId, input.surface, path), pageKey);
        return cloneSurfacePageRoute(route);
    }

    async list(siteId: string): Promise<readonly SurfacePageRoute[]> {
        const prefix = `${JSON.stringify([validateSiteId(siteId)]).slice(0, -1)},`;
        return [...this.#byPage.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([, route]) => cloneSurfacePageRoute(route));
    }

    async get(siteId: string, page: PageReference): Promise<SurfacePageRoute | null> {
        const route = this.#byPage.get(pageScopeKey(siteId, page));
        return route ? cloneSurfacePageRoute(route) : null;
    }

    async resolve(
        siteId: string,
        surface: SurfacePageRoute["surface"],
        path: string,
    ): Promise<SurfacePageRoute | null> {
        const pageKey = this.#byRoute.get(scopedPageRouteKey(siteId, surface, path));
        const route = pageKey ? this.#byPage.get(pageKey) : undefined;
        return route ? cloneSurfacePageRoute(route) : null;
    }

    async updateDefault(
        siteId: string,
        page: PageReference,
        defaultPath: string,
        expectedRevision: number,
    ): Promise<SurfacePageRoute> {
        return this.#replace(siteId, page, expectedRevision, { defaultPath });
    }

    async setOverride(
        siteId: string,
        page: PageReference,
        overridePath: string | null,
        expectedRevision: number,
    ): Promise<SurfacePageRoute> {
        return this.#replace(siteId, page, expectedRevision, { overridePath });
    }

    async remove(siteId: string, page: PageReference, expectedRevision: number): Promise<void> {
        const current = this.#current(siteId, page, expectedRevision);
        const pageKey = pageScopeKey(siteId, page);
        this.#byPage.delete(pageKey);
        this.#byRoute.delete(scopedPageRouteKey(siteId, current.surface, current.path));
    }

    #replace(
        siteId: string,
        page: PageReference,
        expectedRevision: number,
        change: { readonly defaultPath?: string; readonly overridePath?: string | null },
    ): SurfacePageRoute {
        const current = this.#current(siteId, page, expectedRevision);
        const next = nextSurfacePageRoute(current, change);
        const pageKey = pageScopeKey(siteId, page);
        if (next.path !== current.path) {
            this.#assertAvailable(siteId, next.surface, next.path, pageKey);
            this.#byRoute.delete(scopedPageRouteKey(siteId, current.surface, current.path));
            this.#byRoute.set(scopedPageRouteKey(siteId, next.surface, next.path), pageKey);
        }
        this.#byPage.set(pageKey, next);
        return cloneSurfacePageRoute(next);
    }

    #current(siteId: string, page: PageReference, expectedRevision: number): SurfacePageRoute {
        const current = this.#byPage.get(pageScopeKey(siteId, page));
        if (!current) {
            throw new PageRouteNotFoundError(page);
        }
        if (current.revision !== expectedRevision) {
            throw new PageRouteRevisionConflictError(expectedRevision, current.revision);
        }
        return current;
    }

    #assertAvailable(siteId: string, surface: SurfacePageRoute["surface"], path: string, owner?: string): void {
        const existing = this.#byRoute.get(scopedPageRouteKey(siteId, surface, path));
        if (existing && existing !== owner) {
            throw new PageRouteCollisionError(path);
        }
    }
}
