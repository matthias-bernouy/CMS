import type { Collection, Db } from "mongodb";
import {
    PageRouteAlreadyRegisteredError,
    PageRouteCollisionError,
    PageRouteNotFoundError,
    PageRouteRevisionConflictError,
} from "cms-content/pages/core/routing/errors";
import {
    clonePageRoute,
    nextPageRoute,
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

interface PageRouteDocument extends RegisteredPageRoute {
    readonly _id: string;
    readonly siteId: string;
    readonly routeKey: string;
}

export class MongoPageRouteRegistry implements PageRouteRegistry {
    readonly #routes: Collection<PageRouteDocument>;
    readonly #ready: Promise<unknown>;

    constructor(db: Db, collectionPrefix = "") {
        this.#routes = db.collection(`${collectionPrefix}cms_page_routes`);
        this.#ready = Promise.all([
            this.#routes.createIndex({ routeKey: 1 }, { unique: true }),
            this.#routes.createIndex({ siteId: 1 }),
            this.#routes.createIndex({ siteId: 1, defaultPath: 1 }, { unique: true }),
        ]);
    }

    async register(siteId: string, input: PageRouteRegistration): Promise<RegisteredPageRoute> {
        await this.#ready;
        validateSiteId(siteId);
        const page = validatePageReference(input.page);
        const path = validateRegisteredPagePath(input.defaultPath);
        const route = { page, defaultPath: path, path, revision: 1 } as const;
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
        return clonePageRoute(route);
    }

    async list(siteId: string): Promise<readonly RegisteredPageRoute[]> {
        await this.#ready;
        return (await this.#routes.find({ siteId: validateSiteId(siteId) }).toArray()).map((document) =>
            this.#route(document),
        );
    }

    async get(siteId: string, page: PageReference): Promise<RegisteredPageRoute | null> {
        await this.#ready;
        const document = await this.#routes.findOne({ _id: pageScopeKey(siteId, page) });
        return document ? this.#route(document) : null;
    }

    async resolve(siteId: string, path: string): Promise<RegisteredPageRoute | null> {
        await this.#ready;
        const document = await this.#routes.findOne({ routeKey: scopedPageRouteKey(siteId, path) });
        return document ? this.#route(document) : null;
    }

    async resolveDefault(siteId: string, defaultPath: string): Promise<RegisteredPageRoute | null> {
        await this.#ready;
        const document = await this.#routes.findOne({
            siteId: validateSiteId(siteId),
            defaultPath: validateRegisteredPagePath(defaultPath),
        });
        return document ? this.#route(document) : null;
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
        await this.#ready;
        const result = await this.#routes.deleteOne({ _id: pageScopeKey(siteId, page), revision: expectedRevision });
        if (!result.deletedCount) {
            await this.#throwMissingOrConflict(siteId, page, expectedRevision);
        }
    }

    async #replace(
        siteId: string,
        page: PageReference,
        expectedRevision: number,
        change: { readonly defaultPath?: string; readonly overridePath?: string | null },
    ): Promise<RegisteredPageRoute> {
        await this.#ready;
        const current = await this.get(siteId, page);
        if (!current) {
            throw new PageRouteNotFoundError(page);
        }
        if (current.revision !== expectedRevision) {
            throw new PageRouteRevisionConflictError(expectedRevision, current.revision);
        }
        const next = nextPageRoute(current, change);
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
        return clonePageRoute(next);
    }

    async #throwMissingOrConflict(siteId: string, page: PageReference, expectedRevision: number): Promise<never> {
        const actual = await this.get(siteId, page);
        if (!actual) {
            throw new PageRouteNotFoundError(page);
        }
        throw new PageRouteRevisionConflictError(expectedRevision, actual.revision);
    }

    #document(siteId: string, route: RegisteredPageRoute): PageRouteDocument {
        return {
            _id: pageScopeKey(siteId, route.page),
            siteId: validateSiteId(siteId),
            routeKey: scopedPageRouteKey(siteId, route.path),
            ...clonePageRoute(route),
        };
    }

    #route(document: PageRouteDocument): RegisteredPageRoute {
        const { _id, siteId, routeKey, ...route } = document;
        if (_id !== pageScopeKey(siteId, route.page)) {
            throw new Error("Stored Page identity is invalid.");
        }
        if (routeKey !== scopedPageRouteKey(siteId, route.path)) {
            throw new Error("Stored Page route key is invalid.");
        }
        return clonePageRoute(route);
    }
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}
