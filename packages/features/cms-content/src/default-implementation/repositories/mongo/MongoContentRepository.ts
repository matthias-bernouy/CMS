import { randomUUIDv7 } from "bun";
import type { PageLink } from "cms-content/interfaces/CmsRepository";
import type { PageRoute, TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";
import { isPublishedPage } from "cms-content/core/lifecycle/publication";
import { migratedPagePaths, planPagePaths } from "cms-content/core/lifecycle/pagePaths";
import { assertPagePathNotReserved, publicPagePath } from "cms-content/core/utils/localizedPagePath";
import { MongoBlocRepository } from "cms-content/default-implementation/repositories/mongo/MongoBlocRepository";
import { fromPageDoc } from "cms-content/default-implementation/repositories/mongo/documents";
import {
    ContentValidationError,
    DuplicatePagePathError,
    PagePathUpdateConflictError,
} from "cms-content/core/validation/errors";
import { SYSTEM_ID } from "cms-content/default-implementation/repositories/mongo/MongoRepositoryStorage";
import {
    deleteMongoPage,
    recoverMongoPageDeletions,
} from "cms-content/default-implementation/repositories/mongo/pageRoutes/deletion";
import {
    recoverMongoPageInserts,
    recoverMongoPagePathUpdates,
} from "cms-content/default-implementation/repositories/mongo/pageRoutes/recovery";
import {
    canUsePageRoute,
    rethrowPagePathConflict,
    updateMongoPagePaths,
} from "cms-content/default-implementation/repositories/mongo/pageRoutes/updates";
import {
    claimInterruptedRouteMigration,
    claimRouteMigration,
    releaseRouteMigration,
} from "cms-content/default-implementation/repositories/mongo/pageRoutes/migrationFence";
import {
    readSystemDocument,
    systemFromDocument,
    withPageDeletionLock,
    withPageRouteWrite,
} from "cms-content/default-implementation/repositories/mongo/pageRoutes/systemFence";

export class MongoContentRepository extends MongoBlocRepository {
    override async init(): Promise<void> {
        await super.init();
        for (let attempt = 0; attempt < 20; attempt++) {
            const stored = await readSystemDocument(this.system);
            let revision = stored.settingsRevision ?? 0;
            let migration = stored.routeMigration;
            if (migration) {
                const recovered = await claimInterruptedRouteMigration(this.system);
                if (!recovered) {
                    continue;
                }
                migration = recovered.migration;
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
                migration = (await readSystemDocument(this.system)).routeMigration;
                if (migration?.token !== token) {
                    throw new Error("Page route recovery claim changed before it began.");
                }
            }
            if (!migration) {
                continue;
            }
            try {
                await this.migrateLegacyPagePaths(migration.target, migration.previousDefaultLanguage, true);
                const committed = await this.system.replaceOne(
                    { _id: SYSTEM_ID, "routeMigration.token": migration.token },
                    { ...migration.target, settingsRevision: revision + 1, activePageWrites: 0 },
                );
                if (!committed.matchedCount) {
                    throw new Error("Page route migration changed during recovery.");
                }
                return;
            } finally {
                releaseRouteMigration(migration.token);
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
                  ...(route.ownerPageId ? { ownerPageId: route.ownerPageId } : {}),
                  language: route.language,
              }
            : null;
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

    async getPublishedPage(path: string): Promise<TPage | null> {
        if ((await this.getPageRoute(path))?.state === "gone") {
            return null;
        }
        const page = await this.getPage(path);
        return isPublishedPage(page) ? page : null;
    }

    async getPublishedPages(): Promise<TPage[]> {
        return (await this.getAllPages()).filter(isPublishedPage);
    }

    async insertPage(path: string, title: string, content = "<p></p>"): Promise<void> {
        return withPageRouteWrite(this.system, async (system) => {
            const language = system.site.language;
            const publicPath = publicPagePath(language, path, language);
            assertPagePathNotReserved(publicPath, [language, ...(system.site.additionalLanguages ?? [])]);
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
                    path: publicPath,
                    ...(language ? { paths: { [language]: path } } : {}),
                    title,
                    content,
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

    async updatePage(page: Partial<TPage>): Promise<void> {
        if (!page.id) {
            throw new Error("updatePage requires `id` on the input.");
        }
        const { id, ...rest } = page;
        delete rest.paths;
        const stored = await this.pages.findOne({ _id: id });
        if (!stored) {
            return;
        }
        if (stored.deletionIntent) {
            throw new Error("Page deletion is in progress.");
        }
        if (stored.pathUpdateIntent) {
            throw new PagePathUpdateConflictError();
        }
        const existing = fromPageDoc(stored)!;
        if (rest.path && rest.path !== existing.path) {
            const language = (await this.routeSystem()).site.language;
            if (language) {
                await this.setPagePaths(id, { ...existing.paths, [language]: rest.path });
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
        try {
            const saved = await this.pages.updateOne(
                { _id: id, deletionIntent: { $exists: false }, pathUpdateIntent: { $exists: false } },
                { $set: rest },
            );
            if (!saved.matchedCount) {
                throw new PagePathUpdateConflictError();
            }
        } catch (error) {
            rethrowPagePathConflict(error, page.path ?? "");
        }
    }

    async deletePage(id: string): Promise<void> {
        return this.deletePageWithAlternative(id, null);
    }

    async setPagePaths(
        id: string,
        paths: Record<string, string>,
        system?: TSystem,
        expectedPaths?: Record<string, string>,
        allowLegacyDefaultRoute = false,
    ): Promise<TPage> {
        const save = async (routeSystem: TSystem) => {
            const plan = planPagePaths(paths, routeSystem);
            const languages = [routeSystem.site.language, ...(routeSystem.site.additionalLanguages ?? [])];
            for (const route of plan.current) {
                assertPagePathNotReserved(route.path, languages);
            }
            return updateMongoPagePaths(
                this.pages,
                this.pageRoutes,
                id,
                plan,
                routeSystem,
                allowLegacyDefaultRoute,
                expectedPaths,
            );
        };
        return allowLegacyDefaultRoute
            ? save(system ?? (await this.routeSystem()))
            : withPageRouteWrite(this.system, save);
    }

    async deletePageWithAlternative(id: string, alternativeId: string | null): Promise<void> {
        await withPageRouteWrite(this.system, async (_system, permitToken) =>
            withPageDeletionLock(this.system, permitToken, () =>
                deleteMongoPage(this.pages, this.pageRoutes, id, alternativeId),
            ),
        );
    }

    async getLinks(): Promise<PageLink[]> {
        const documents = await this.pages.find({}, { projection: { path: 1, title: 1 } }).toArray();
        return documents.map((document) => ({ path: document.path, title: document.title }));
    }

    protected async migrateLegacyPagePaths(
        system: TSystem,
        previousDefaultLanguage?: string,
        validateReservedPaths = false,
        dryRun = false,
    ): Promise<void> {
        await recoverMongoPageInserts(this.pages, this.pageRoutes);
        await recoverMongoPagePathUpdates(this.pages, this.pageRoutes);
        await recoverMongoPageDeletions(this.pages, this.pageRoutes);
        const documents = await this.pages.find({}).toArray();
        if (!system.site.language) {
            if (dryRun) {
                return;
            }
            for (const document of documents) {
                const route = await this.getPageRoute(document.path);
                if (
                    route?.state === "redirect" &&
                    route.pageId === document._id &&
                    (!route.ownerPageId || route.ownerPageId === document._id)
                ) {
                    await this.pageRoutes.updateOne(
                        { _id: document.path, pageId: document._id, state: "redirect" },
                        { $set: { state: "current", ownerPageId: document._id, language: "" } },
                    );
                }
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
            plan: planPagePaths(migratedPagePaths(fromPageDoc(document)!, system, previousDefaultLanguage), system),
        }));
        const claims = new Map<string, string>();
        for (const { document, plan } of plans) {
            for (const { path } of plan.current) {
                if (validateReservedPaths) {
                    assertPagePathNotReserved(path, [system.site.language, ...(system.site.additionalLanguages ?? [])]);
                }
                const route = await this.getPageRoute(path);
                const claimant = claims.get(path);
                if (
                    (claimant && claimant !== document._id) ||
                    (route &&
                        !canUsePageRoute(
                            route,
                            document._id,
                            path === plan.primaryPath && route.language === system.site.language,
                        )) ||
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
                await this.setPagePaths(document._id, plan.paths, system, undefined, true);
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

    private async ensureCurrentRoute(path: string, pageId: string, language: string): Promise<void> {
        const existing = await this.getPageRoute(path);
        if (existing) {
            if (existing.pageId !== pageId || existing.state !== "current") {
                throw new DuplicatePagePathError(path);
            }
            if (existing.language !== language || !existing.ownerPageId) {
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

function samePagePaths(left: Record<string, string> | undefined, right: Record<string, string>): boolean {
    return (
        !!left &&
        Object.keys(left).length === Object.keys(right).length &&
        Object.entries(right).every(([language, path]) => left[language] === path)
    );
}
