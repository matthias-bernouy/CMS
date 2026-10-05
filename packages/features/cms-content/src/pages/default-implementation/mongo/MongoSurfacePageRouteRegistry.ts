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

interface SurfacePageRouteDocument extends SurfacePageRoute {
    readonly _id: string;
    readonly routeKey: string;
}

export class MongoSurfacePageRouteRegistry implements SurfacePageRouteRegistry {
    readonly #routes: Collection<SurfacePageRouteDocument>;
    readonly #ready: Promise<string>;

    constructor(db: Db, collectionPrefix = "") {
        this.#routes = db.collection(`${collectionPrefix}cms_surface_page_routes`);
        this.#ready = this.#routes.createIndex({ routeKey: 1 }, { unique: true });
    }

    async register(input: SurfacePageRouteRegistration): Promise<SurfacePageRoute> {
        await this.#ready;
        const page = validatePageReference(input.page);
        const path = validatePagePath(input.defaultPath);
        const route = { page, surface: input.surface, defaultPath: path, path, revision: 1 } as const;
        try {
            await this.#routes.insertOne(this.#document(route));
        } catch (error) {
            if (!isDuplicateKey(error)) {
                throw error;
            }
            if (await this.#routes.findOne({ _id: pageReferenceKey(page) })) {
                throw new PageRouteAlreadyRegisteredError();
            }
            throw new PageRouteCollisionError(path);
        }
        return cloneSurfacePageRoute(route);
    }

    async get(page: PageReference): Promise<SurfacePageRoute | null> {
        await this.#ready;
        const document = await this.#routes.findOne({ _id: pageReferenceKey(page) });
        return document ? this.#route(document) : null;
    }

    async resolve(surface: SurfacePageRoute["surface"], path: string): Promise<SurfacePageRoute | null> {
        await this.#ready;
        const document = await this.#routes.findOne({ routeKey: pageRouteKey(surface, path) });
        return document ? this.#route(document) : null;
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
        await this.#ready;
        const id = pageReferenceKey(page);
        const result = await this.#routes.deleteOne({ _id: id, revision: expectedRevision });
        if (!result.deletedCount) {
            await this.#throwMissingOrConflict(page, expectedRevision);
        }
    }

    async #replace(
        page: PageReference,
        expectedRevision: number,
        change: { readonly defaultPath?: string; readonly overridePath?: string | null },
    ): Promise<SurfacePageRoute> {
        await this.#ready;
        const current = await this.get(page);
        if (!current) {
            throw new PageRouteNotFoundError(page);
        }
        if (current.revision !== expectedRevision) {
            throw new PageRouteRevisionConflictError(expectedRevision, current.revision);
        }
        const next = nextSurfacePageRoute(current, change);
        try {
            const result = await this.#routes.replaceOne(
                { _id: pageReferenceKey(page), revision: expectedRevision },
                this.#document(next),
            );
            if (!result.matchedCount) {
                await this.#throwMissingOrConflict(page, expectedRevision);
            }
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new PageRouteCollisionError(next.path);
            }
            throw error;
        }
        return cloneSurfacePageRoute(next);
    }

    async #throwMissingOrConflict(page: PageReference, expectedRevision: number): Promise<never> {
        const actual = await this.get(page);
        if (!actual) {
            throw new PageRouteNotFoundError(page);
        }
        throw new PageRouteRevisionConflictError(expectedRevision, actual.revision);
    }

    #document(route: SurfacePageRoute): SurfacePageRouteDocument {
        return {
            _id: pageReferenceKey(route.page),
            routeKey: pageRouteKey(route.surface, route.path),
            ...cloneSurfacePageRoute(route),
        };
    }

    #route(document: SurfacePageRouteDocument): SurfacePageRoute {
        const { _id, routeKey, ...route } = document;
        pageReferenceKey(route.page);
        if (routeKey !== pageRouteKey(route.surface, route.path)) {
            throw new Error("Stored surface Page route key is invalid.");
        }
        return cloneSurfacePageRoute(route);
    }
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}
