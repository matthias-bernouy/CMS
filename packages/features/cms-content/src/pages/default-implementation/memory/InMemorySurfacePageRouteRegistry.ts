import {
    PageRouteAlreadyRegisteredError,
    PageRouteCollisionError,
    PageRouteNotFoundError,
    PageRouteRevisionConflictError,
} from "cms-content/pages/core/routing/errors";
import {
    cloneSurfacePageRoute,
    nextSurfacePageRoute,
    pageReferenceKey,
    pageRouteKey,
    validatePageReference,
} from "cms-content/pages/core/routing/values";
import { validatePagePath } from "cms-content/pages/core/validation/page";
import type {
    PageReference,
    SurfacePageRoute,
    SurfacePageRouteRegistration,
    SurfacePageRouteRegistry,
} from "cms-content/pages/interfaces/routing";

export class InMemorySurfacePageRouteRegistry implements SurfacePageRouteRegistry {
    readonly #byPage = new Map<string, SurfacePageRoute>();
    readonly #byRoute = new Map<string, string>();

    async register(input: SurfacePageRouteRegistration): Promise<SurfacePageRoute> {
        const page = validatePageReference(input.page);
        const pageKey = pageReferenceKey(page);
        if (this.#byPage.has(pageKey)) {
            throw new PageRouteAlreadyRegisteredError();
        }
        const path = validatePagePath(input.defaultPath);
        this.#assertAvailable(input.surface, path);
        const route = { page, surface: input.surface, defaultPath: path, path, revision: 1 } as const;
        this.#byPage.set(pageKey, route);
        this.#byRoute.set(pageRouteKey(input.surface, path), pageKey);
        return cloneSurfacePageRoute(route);
    }

    async list(): Promise<readonly SurfacePageRoute[]> {
        return [...this.#byPage.values()].map(cloneSurfacePageRoute);
    }

    async get(page: PageReference): Promise<SurfacePageRoute | null> {
        const route = this.#byPage.get(pageReferenceKey(page));
        return route ? cloneSurfacePageRoute(route) : null;
    }

    async resolve(surface: SurfacePageRoute["surface"], path: string): Promise<SurfacePageRoute | null> {
        const pageKey = this.#byRoute.get(pageRouteKey(surface, path));
        const route = pageKey ? this.#byPage.get(pageKey) : undefined;
        return route ? cloneSurfacePageRoute(route) : null;
    }

    async updateDefault(page: PageReference, defaultPath: string, expectedRevision: number): Promise<SurfacePageRoute> {
        return this.#replace(page, expectedRevision, { defaultPath });
    }

    async setOverride(
        page: PageReference,
        overridePath: string | null,
        expectedRevision: number,
    ): Promise<SurfacePageRoute> {
        return this.#replace(page, expectedRevision, { overridePath });
    }

    async remove(page: PageReference, expectedRevision: number): Promise<void> {
        const current = this.#current(page, expectedRevision);
        const pageKey = pageReferenceKey(page);
        this.#byPage.delete(pageKey);
        this.#byRoute.delete(pageRouteKey(current.surface, current.path));
    }

    #replace(
        page: PageReference,
        expectedRevision: number,
        change: { readonly defaultPath?: string; readonly overridePath?: string | null },
    ): SurfacePageRoute {
        const current = this.#current(page, expectedRevision);
        const next = nextSurfacePageRoute(current, change);
        const pageKey = pageReferenceKey(page);
        if (next.path !== current.path) {
            this.#assertAvailable(next.surface, next.path, pageKey);
            this.#byRoute.delete(pageRouteKey(current.surface, current.path));
            this.#byRoute.set(pageRouteKey(next.surface, next.path), pageKey);
        }
        this.#byPage.set(pageKey, next);
        return cloneSurfacePageRoute(next);
    }

    #current(page: PageReference, expectedRevision: number): SurfacePageRoute {
        const current = this.#byPage.get(pageReferenceKey(page));
        if (!current) {
            throw new PageRouteNotFoundError(page);
        }
        if (current.revision !== expectedRevision) {
            throw new PageRouteRevisionConflictError(expectedRevision, current.revision);
        }
        return current;
    }

    #assertAvailable(surface: SurfacePageRoute["surface"], path: string, owner?: string): void {
        const existing = this.#byRoute.get(pageRouteKey(surface, path));
        if (existing && existing !== owner) {
            throw new PageRouteCollisionError(path);
        }
    }
}
