import {
    readSystemDocument,
    systemFromDocument,
} from "content/application/default-implementation/mongo/repositories/pageRoutes/systemDocument";
import { randomUUIDv7 } from "bun";
import type { PageLink } from "content/application/interfaces/ContentRepository";
import type { PageRoute, TPage } from "content/pages/interfaces/pages";
import type { TSystem } from "content/settings/interfaces/settings";
import { pagePathsForSystem, planPagePaths } from "content/pages/core/lifecycle/pagePaths";
import { publicPagePath } from "content/pages/core/paths/localizedPagePath";
import { MongoBlocRepository } from "content/application/default-implementation/mongo/repositories/MongoBlocRepository";
import { fromPageDoc } from "content/application/default-implementation/mongo/repositories/documents";
import {
    ContentValidationError,
    DuplicatePagePathError,
    PagePathUpdateConflictError,
    PageRevisionConflictError,
} from "content/application/core/validation/errors";
import { SYSTEM_ID } from "content/application/default-implementation/mongo/repositories/MongoRepositoryStorage";
import {
    deleteMongoPage,
    recoverMongoPageDeletions,
} from "content/application/default-implementation/mongo/repositories/pageRoutes/deletion";
import {
    recoverMongoPageInserts,
    recoverMongoPagePathUpdates,
} from "content/application/default-implementation/mongo/repositories/pageRoutes/recovery";
import {
    rethrowPagePathConflict,
    updateMongoPagePaths,
} from "content/application/default-implementation/mongo/repositories/pageRoutes/updates";
import {
    claimInterruptedRouteMigration,
    claimRouteMigration,
    releaseRouteMigration,
} from "content/application/default-implementation/mongo/repositories/pageRoutes/migrationFence";
import {
    withPageDeletionLock,
    withPageRouteWrite,
} from "content/application/default-implementation/mongo/repositories/pageRoutes/systemFence";
import {
    type PageContentReference,
    pageContentReferenceKey,
    pageContentReferenceKeys,
} from "content/pages/core/queries/contentReferences";
import { canUsePageRoute, requirePageScan, samePagePaths } from "content/pages/core/routing/values";

export class MongoPageRepository extends MongoBlocRepository {
    override async init(): Promise<void> {
        await super.init();
        for (const field of ["revision", "contentReferences"]) {
            if (await this.pages.findOne({ [field]: { $exists: false } }, { projection: { _id: 1 } })) {
                throw new Error(`Stored Page requires ${field}; reset incompatible persisted data.`);
            }
        }
        for (let attempt = 0; attempt < 20; attempt++) {
            const stored = await readSystemDocument(this.system);
            let revision = stored.settingsRevision;
            let routeChange = stored.routeMigration;
            const reconfigure = routeChange !== undefined;
            if (routeChange) {
                const recovered = await claimInterruptedRouteMigration(this.system);
                if (!recovered) {
                    continue;
                }
                routeChange = recovered.migration;
                revision = recovered.revision;
            } else {
                const target = systemFromDocument(stored);
                const token = randomUUIDv7();
                try {
                    const claimed = await claimRouteMigration(this.system, revision, {
                        token,
                        target,
                        previousDefaultLanguage: target.site.language,
                        requestedAt: new Date(),
                    });
                    if (!claimed) {
                        continue;
                    }
                } catch (error) {
                    if ((await readSystemDocument(this.system)).routeMigration) {
                        continue;
                    }
                    throw error;
                }
                routeChange = (await readSystemDocument(this.system)).routeMigration;
                if (routeChange?.token !== token) {
                    throw new Error("Page route maintenance claim changed before it began.");
                }
            }
            if (!routeChange) {
                continue;
            }
            try {
                await this.recoverPendingPageWrites(routeChange.target);
                if (reconfigure) {
                    await this.reconfigurePageRoutes(routeChange.target, routeChange.previousDefaultLanguage);
                }
                const committed = await this.system.replaceOne(
                    { _id: SYSTEM_ID, "routeMigration.token": routeChange.token },
                    {
                        ...routeChange.target,
                        settingsRevision: revision + 1,
                        activePageWrites: 0,
                        activePageWritePermits: {},
                    },
                );
                if (!committed.matchedCount) {
                    throw new Error("Page route maintenance changed during recovery.");
                }
                return;
            } finally {
                releaseRouteMigration(routeChange.token);
            }
        }
        throw new Error("Page route recovery could not claim the site.");
    }

    async getPageRoute(path: string): Promise<PageRoute | null> {
        const route = await this.pageRoutes.findOne({ _id: path });
        return route
            ? {
                  path: route._id,
                  state: route.state,
                  pageId: route.pageId,
                  ownerPageId: route.ownerPageId,
                  language: route.language,
              }
            : null;
    }

    async getPageRoutes(paths: readonly string[]): Promise<PageRoute[]> {
        const unique = [...new Set(paths)];
        if (unique.length === 0) {
            return [];
        }
        return (await this.pageRoutes.find({ _id: { $in: unique } }).toArray()).map((route) => ({
            path: route._id,
            state: route.state,
            pageId: route.pageId,
            ownerPageId: route.ownerPageId,
            language: route.language,
        }));
    }

    async getPage(path: string): Promise<TPage | null> {
        const direct = await this.pages.findOne({ path });
        if (direct) {
            return fromPageDoc(direct);
        }
        const route = await this.getPageRoute(path);
        return route && route.state !== "gone" ? this.getPageById(route.pageId) : null;
    }

    async getAllPages(): Promise<TPage[]> {
        const documents = await this.pages.find().toArray();
        return documents.map((document) => fromPageDoc(document)!);
    }

    async scanPages(cursor: string | undefined, limit: number) {
        requirePageScan(cursor, limit);
        const documents = await this.pages
            .find(cursor === undefined ? {} : { _id: { $gt: cursor } })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        const pages = documents.map((document) => fromPageDoc(document)!);
        return {
            pages,
            ...(pages.length === limit ? { nextCursor: pages.at(-1)!.id } : {}),
        };
    }

    async scanPagesByContentReference(reference: PageContentReference, cursor: string | undefined, limit: number) {
        requirePageScan(cursor, limit);
        const documents = await this.pages
            .find({
                contentReferences: pageContentReferenceKey(reference),
                ...(cursor === undefined ? {} : { _id: { $gt: cursor } }),
            })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        const pages = documents.map((document) => fromPageDoc(document)!);
        return {
            pages,
            ...(pages.length === limit ? { nextCursor: pages.at(-1)!.id } : {}),
        };
    }

    async getPublishedPage(path: string): Promise<TPage | null> {
        if ((await this.getPageRoute(path))?.state === "gone") {
            return null;
        }
        const direct = fromPageDoc(
            await this.pages.findOne({ path, visible: true, deletionIntent: { $exists: false } }),
        );
        if (direct) {
            return direct;
        }
        const route = await this.getPageRoute(path);
        return route ? this.getPublishedPageById(route.pageId) : null;
    }

    async getPublishedPageById(id: string): Promise<TPage | null> {
        return fromPageDoc(
            await this.pages.findOne({
                _id: id,
                visible: true,
                deletionIntent: { $exists: false },
            }),
        );
    }

    async getPublishedPagesByIds(ids: readonly string[]): Promise<TPage[]> {
        const unique = [...new Set(ids)];
        if (unique.length === 0) {
            return [];
        }
        const documents = await this.pages
            .find({ _id: { $in: unique }, visible: true, deletionIntent: { $exists: false } })
            .toArray();
        return documents.map((document) => fromPageDoc(document)!);
    }

    async getPagesByIds(ids: readonly string[]): Promise<TPage[]> {
        if (ids.length === 0) {
            return [];
        }
        const documents = await this.pages
            .find({ _id: { $in: [...new Set(ids)] }, deletionIntent: { $exists: false } })
            .toArray();
        return documents.map((document) => fromPageDoc(document)!);
    }

    async getPublishedPages(): Promise<TPage[]> {
        const documents = await this.pages.find({ visible: true, deletionIntent: { $exists: false } }).toArray();
        return documents.map((document) => fromPageDoc(document)!);
    }

    async insertPage(path: string, title: string, content = ""): Promise<void> {
        return withPageRouteWrite(this.system, async (system) => {
            const language = system.site.language;
            const publicPath = publicPagePath(language, path, language);
            const id = randomUUIDv7();
            try {
                await this.pageRoutes.insertOne({
                    _id: publicPath,
                    state: "current",
                    pageId: id,
                    ownerPageId: id,
                    language,
                    pageInsertToken: id,
                });
            } catch (error) {
                rethrowPagePathConflict(error, publicPath);
            }
            try {
                await this.pages.insertOne({
                    _id: id,
                    revision: 1,
                    path: publicPath,
                    ...(language ? { paths: { [language]: path } } : {}),
                    title,
                    content,
                    contentReferences: pageContentReferenceKeys(content),
                    description: "",
                    tags: [],
                    visible: false,
                });
            } catch (error) {
                if ((await this.pages.findOne({ _id: id }))?.path !== publicPath) {
                    await this.pageRoutes.deleteOne({ _id: publicPath, pageId: id, pageInsertToken: id });
                    rethrowPagePathConflict(error, publicPath);
                }
            }
            await this.pageRoutes.updateOne(
                { _id: publicPath, pageId: id, pageInsertToken: id },
                { $set: {}, $unset: { pageInsertToken: "" } },
            );
        });
    }

    async getPageById(id: string): Promise<TPage | null> {
        return fromPageDoc(await this.pages.findOne({ _id: id }));
    }

    async updatePage(page: Partial<TPage>, expectedRevision?: number): Promise<TPage | null> {
        if (!page.id) {
            throw new Error("updatePage requires `id` on the input.");
        }
        const { id, revision: _revision, ...rest } = page;
        delete rest.paths;
        const stored = await this.pages.findOne({ _id: id });
        if (!stored) {
            return null;
        }
        if (stored.deletionIntent) {
            throw new Error("Page deletion is in progress.");
        }
        if (stored.pathUpdateIntent) {
            throw new PagePathUpdateConflictError();
        }
        const existing = fromPageDoc(stored)!;
        if (Object.hasOwn(rest, "origin")) {
            throw new ContentValidationError("origin", "unsupported Page property");
        }
        if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
            throw new PageRevisionConflictError(expectedRevision, existing.revision);
        }
        let writeRevision = expectedRevision;
        if (rest.path && rest.path !== existing.path) {
            const language = (await this.routeSystem()).site.language;
            if (language) {
                const updated = await this.setPagePaths(
                    id,
                    { ...existing.paths, [language]: rest.path },
                    undefined,
                    undefined,
                    expectedRevision,
                );
                writeRevision = updated.revision;
                delete rest.path;
            } else {
                throw new ContentValidationError(
                    "path",
                    "configure the default site language before changing a page URL",
                );
            }
        } else {
            delete rest.path;
        }
        if (rest.content !== undefined) {
            Object.assign(rest, { contentReferences: pageContentReferenceKeys(rest.content) });
        }
        try {
            const saved = await this.pages.updateOne(
                {
                    _id: id,
                    deletionIntent: { $exists: false },
                    pathUpdateIntent: { $exists: false },
                    ...(writeRevision === undefined ? {} : { revision: writeRevision }),
                },
                { $set: rest, $inc: { revision: 1 } },
            );
            if (!saved.matchedCount) {
                const actual = fromPageDoc(await this.pages.findOne({ _id: id }));
                if (writeRevision !== undefined && actual && actual.revision !== writeRevision) {
                    throw new PageRevisionConflictError(writeRevision, actual.revision);
                }
                throw new PagePathUpdateConflictError();
            }
            return fromPageDoc(await this.pages.findOne({ _id: id }));
        } catch (error) {
            rethrowPagePathConflict(error, page.path ?? "");
        }
    }

    async deletePage(id: string, expectedRevision?: number): Promise<void> {
        return this.deletePageWithAlternative(id, null, expectedRevision);
    }

    async setPagePaths(
        id: string,
        paths: Record<string, string>,
        system?: TSystem,
        expectedPaths?: Record<string, string>,
        expectedRevision?: number,
        duringRouteReconfiguration = false,
    ): Promise<TPage> {
        const save = async (routeSystem: TSystem) => {
            const plan = planPagePaths(paths, routeSystem);
            return updateMongoPagePaths(
                this.pages,
                this.pageRoutes,
                id,
                plan,
                routeSystem,
                expectedPaths,
                expectedRevision,
            );
        };
        return duringRouteReconfiguration
            ? save(system ?? (await this.routeSystem()))
            : withPageRouteWrite(this.system, save);
    }

    async deletePageWithAlternative(
        id: string,
        alternativeId: string | null,
        expectedRevision?: number,
    ): Promise<void> {
        await withPageRouteWrite(this.system, async (_system, permitToken) =>
            withPageDeletionLock(this.system, permitToken, () =>
                deleteMongoPage(this.pages, this.pageRoutes, this.system, id, alternativeId, expectedRevision),
            ),
        );
    }

    async getLinks(): Promise<PageLink[]> {
        const documents = await this.pages.find({}, { projection: { path: 1, title: 1 } }).toArray();
        return documents.map((document) => ({
            page: { pageId: document._id },
            path: document.path,
            title: document.title,
        }));
    }

    protected async reconfigurePageRoutes(
        system: TSystem,
        previousDefaultLanguage?: string,
        dryRun = false,
    ): Promise<void> {
        const documents = await this.pages.find({}).toArray();
        if (!system.site.language) {
            if (dryRun) {
                return;
            }
            for (const document of documents) {
                await this.ensureCurrentRoute(document.path, document._id, "");
                for (const extra of await this.pageRoutes.find({ pageId: document._id, state: "current" }).toArray()) {
                    if (extra._id !== document.path) {
                        await this.pageRoutes.updateOne({ _id: extra._id }, { $set: { state: "redirect" } });
                    }
                }
            }
            return;
        }
        const pathOwners = new Map(documents.map((document) => [document.path, document._id]));
        const plans = documents.map((document) => ({
            document,
            plan: planPagePaths(pagePathsForSystem(fromPageDoc(document)!, system, previousDefaultLanguage), system),
        }));
        const claims = new Map<string, string>();
        for (const { document, plan } of plans) {
            for (const { path } of plan.current) {
                const route = await this.getPageRoute(path);
                const claimant = claims.get(path);
                if (
                    (claimant && claimant !== document._id) ||
                    (route && !canUsePageRoute(route, document._id)) ||
                    (pathOwners.has(path) && pathOwners.get(path) !== document._id)
                ) {
                    throw new DuplicatePagePathError(path);
                }
                claims.set(path, document._id);
            }
        }
        if (dryRun) {
            return;
        }
        for (const { document, plan } of plans) {
            const currentPaths = new Set(plan.current.map(({ path }) => path));
            const oldLanguage =
                Object.entries(document.paths ?? {}).find(
                    ([code, local]) =>
                        publicPagePath(code, local, system.site.language) === document.path ||
                        publicPagePath(code, local, "") === document.path,
                )?.[0] ?? "";
            await this.ensureCurrentRoute(document.path, document._id, oldLanguage);
            if (document.path !== plan.primaryPath || !samePagePaths(document.paths, plan.paths)) {
                await this.setPagePaths(document._id, plan.paths, system, undefined, undefined, true);
                continue;
            }
            for (const route of plan.current) {
                await this.ensureCurrentRoute(route.path, document._id, route.language);
            }
            for (const route of await this.pageRoutes.find({ pageId: document._id, state: "current" }).toArray()) {
                if (!currentPaths.has(route._id)) {
                    await this.pageRoutes.updateOne({ _id: route._id }, { $set: { state: "redirect" } });
                }
            }
        }
    }

    private async routeSystem() {
        return systemFromDocument(await readSystemDocument(this.system));
    }

    private async recoverPendingPageWrites(system: TSystem): Promise<void> {
        await recoverMongoPageInserts(this.pages, this.pageRoutes);
        await recoverMongoPagePathUpdates(this.pages, this.pageRoutes, system);
        await recoverMongoPageDeletions(this.pages, this.pageRoutes, this.system);
    }

    private async ensureCurrentRoute(path: string, pageId: string, language: string): Promise<void> {
        const existing = await this.getPageRoute(path);
        if (existing) {
            if (existing.pageId !== pageId || existing.state !== "current") {
                throw new DuplicatePagePathError(path);
            }
            if (existing.language !== language) {
                await this.pageRoutes.updateOne({ _id: path, pageId }, { $set: { language, ownerPageId: pageId } });
            }
            return;
        }
        await this.reserveRoute(path, pageId, language);
    }

    private async reserveRoute(path: string, pageId: string, language: string): Promise<void> {
        try {
            await this.pageRoutes.insertOne({ _id: path, state: "current", pageId, ownerPageId: pageId, language });
        } catch (error) {
            rethrowPagePathConflict(error, path);
        }
    }
}
