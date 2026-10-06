import type { Collection, Db } from "mongodb";
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

interface SurfacePageRouteDocument extends SurfacePageRoute {
    readonly _id: string;
    readonly siteId: string;
    readonly routeKey: string;
}

export class MongoSurfacePageRouteRegistry implements SurfacePageRouteRegistry {
    readonly #routes: Collection<SurfacePageRouteDocument>;
    readonly #ready: Promise<unknown>;

    constructor(db: Db, collectionPrefix = "") {
        this.#routes = db.collection(`${collectionPrefix}cms_surface_page_routes`);
        this.#ready = Promise.all([
            this.#routes.createIndex({ routeKey: 1 }, { unique: true }),
            this.#routes.createIndex({ siteId: 1 }),
        ]);
    }

    async register(siteId: string, input: SurfacePageRouteRegistration): Promise<SurfacePageRoute> {
        await this.#ready;
        validateSiteId(siteId);
        const page = validatePageReference(input.page);
        const path = validateSurfacePagePath(input.surface, input.defaultPath);
        const route = { page, surface: input.surface, defaultPath: path, path, revision: 1 } as const;
        try {
            await this.#routes.insertOne(this.#document(siteId, route));
        } catch (error) {
            if (!isDuplicateKey(error)) {
                throw error;
            }
            if (await this.#routes.findOne({ _id: pageScopeKey(siteId, page) })) {
                throw new PageRouteAlreadyRegisteredError();
            }
            throw new PageRouteCollisionError(path);
        }
        return cloneSurfacePageRoute(route);
    }

    async list(siteId: string): Promise<readonly SurfacePageRoute[]> {
        await this.#ready;
        return (await this.#routes.find({ siteId: validateSiteId(siteId) }).toArray()).map((document) =>
            this.#route(document),
        );
    }

    async get(siteId: string, page: PageReference): Promise<SurfacePageRoute | null> {
        await this.#ready;
        const document = await this.#routes.findOne({ _id: pageScopeKey(siteId, page) });
        return document ? this.#route(document) : null;
    }

    async resolve(
        siteId: string,
        surface: SurfacePageRoute["surface"],
        path: string,
    ): Promise<SurfacePageRoute | null> {
        await this.#ready;
        const document = await this.#routes.findOne({ routeKey: scopedPageRouteKey(siteId, surface, path) });
        return document ? this.#route(document) : null;
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
        await this.#ready;
        const id = pageScopeKey(siteId, page);
        const result = await this.#routes.deleteOne({ _id: id, revision: expectedRevision });
        if (!result.deletedCount) {
            await this.#throwMissingOrConflict(siteId, page, expectedRevision);
        }
    }

    async #replace(
        siteId: string,
        page: PageReference,
        expectedRevision: number,
        change: { readonly defaultPath?: string; readonly overridePath?: string | null },
    ): Promise<SurfacePageRoute> {
        await this.#ready;
        const current = await this.get(siteId, page);
        if (!current) {
            throw new PageRouteNotFoundError(page);
        }
        if (current.revision !== expectedRevision) {
            throw new PageRouteRevisionConflictError(expectedRevision, current.revision);
        }
        const next = nextSurfacePageRoute(current, change);
        try {
            const result = await this.#routes.replaceOne(
                { _id: pageScopeKey(siteId, page), revision: expectedRevision },
                this.#document(siteId, next),
            );
            if (!result.matchedCount) {
                await this.#throwMissingOrConflict(siteId, page, expectedRevision);
            }
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new PageRouteCollisionError(next.path);
            }
            throw error;
        }
        return cloneSurfacePageRoute(next);
    }

    async #throwMissingOrConflict(siteId: string, page: PageReference, expectedRevision: number): Promise<never> {
        const actual = await this.get(siteId, page);
        if (!actual) {
            throw new PageRouteNotFoundError(page);
        }
        throw new PageRouteRevisionConflictError(expectedRevision, actual.revision);
    }

    #document(siteId: string, route: SurfacePageRoute): SurfacePageRouteDocument {
        return {
            _id: pageScopeKey(siteId, route.page),
            siteId: validateSiteId(siteId),
            routeKey: scopedPageRouteKey(siteId, route.surface, route.path),
            ...cloneSurfacePageRoute(route),
        };
    }

    #route(document: SurfacePageRouteDocument): SurfacePageRoute {
        const { _id, siteId, routeKey, ...route } = document;
        if (_id !== pageScopeKey(siteId, route.page)) {
            throw new Error("Stored surface Page identity is invalid.");
        }
        if (routeKey !== scopedPageRouteKey(siteId, route.surface, route.path)) {
            throw new Error("Stored surface Page route key is invalid.");
        }
        return cloneSurfacePageRoute(route);
    }
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}
