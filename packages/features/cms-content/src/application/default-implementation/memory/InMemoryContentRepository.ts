import { randomUUIDv7 } from "bun";
import type { PageLink, PageMeta, PagesQuery } from "cms-content/application/interfaces/CmsRepository";
import type { PageCreateOptions, PageRoute, TPage } from "cms-content/pages/interfaces/pages";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { defaultSystem } from "cms-content/settings/core/system";
import { filterAndSortPages } from "cms-content/pages/core/queries/pagesQuery";
import { isPublishedPage } from "cms-content/pages/core/lifecycle/publication";
import { InMemoryBlocRepository } from "cms-content/application/default-implementation/memory/InMemoryBlocRepository";
import {
    ContentValidationError,
    DuplicatePagePathError,
    PagePathsStaleError,
    PageRevisionConflictError,
} from "cms-content/application/core/validation/errors";
import { pagePathsForSystem, planPagePaths } from "cms-content/pages/core/lifecycle/pagePaths";
import { publicPagePath } from "cms-content/pages/core/paths/localizedPagePath";
import {
    type PageContentReference,
    pageContentReferenceKey,
    pageContentReferenceKeys,
} from "cms-content/pages/core/queries/contentReferences";

export class InMemoryContentRepository extends InMemoryBlocRepository {
    protected readonly pages = new Map<string, TPage>();
    private readonly pageKeysById = new Map<string, string>();
    private readonly pageIdsByContentReference = new Map<string, Set<string>>();
    protected readonly pageRoutes = new Map<string, PageRoute>();
    protected system: TSystem = defaultSystem();

    async getPage(path: string): Promise<TPage | null> {
        const route = this.pageRoutes.get(path);
        const found = this.pages.get(path) ?? (route ? this.findPageEntryById(route.pageId)?.[1] : undefined);
        return found ? { ...found } : null;
    }

    async getPageRoute(path: string): Promise<PageRoute | null> {
        const route = this.pageRoutes.get(path);
        return route ? { ...route } : null;
    }

    async getAllPages(): Promise<TPage[]> {
        return Array.from(this.pages.values()).map((page) => ({ ...page }));
    }

    async scanPages(cursor: string | undefined, limit: number) {
        requirePageScan(cursor, limit);
        const pages = [...this.pages.values()]
            .filter((page) => cursor === undefined || page.id > cursor)
            .sort((left, right) => left.id.localeCompare(right.id))
            .slice(0, limit)
            .map((page) => structuredClone(page));
        return {
            pages,
            ...(pages.length === limit ? { nextCursor: pages.at(-1)!.id } : {}),
        };
    }

    async scanPagesByContentReference(reference: PageContentReference, cursor: string | undefined, limit: number) {
        requirePageScan(cursor, limit);
        const pages = [...(this.pageIdsByContentReference.get(pageContentReferenceKey(reference)) ?? [])]
            .filter((id) => cursor === undefined || id > cursor)
            .sort((left, right) => left.localeCompare(right))
            .slice(0, limit)
            .map((id) => this.findPageEntryById(id)?.[1])
            .filter((page): page is TPage => page !== undefined)
            .map((page) => structuredClone(page));
        return {
            pages,
            ...(pages.length === limit ? { nextCursor: pages.at(-1)!.id } : {}),
        };
    }

    async getPublishedPage(path: string): Promise<TPage | null> {
        if (this.pageRoutes.get(path)?.state === "gone") {
            return null;
        }
        const page = await this.getPage(path);
        return isPublishedPage(page) ? structuredClone(page) : null;
    }

    async getPublishedPageById(id: string): Promise<TPage | null> {
        const page = await this.getPageById(id);
        return isPublishedPage(page) ? structuredClone(page) : null;
    }

    async getPublishedPages(): Promise<TPage[]> {
        return (await this.getAllPages()).filter(isPublishedPage).map((page) => structuredClone(page));
    }

    async insertPage(path: string, title: string, content = "", options: PageCreateOptions = {}): Promise<void> {
        this.assertPageRoutesReady();
        const surface = options.surface ?? "delivery";
        const language = this.system.site.language;
        const publicPath = surface === "delivery" ? publicPagePath(language, path, language) : path;
        if (this.pageRoutes.has(publicPath) || this.pages.has(publicPath)) {
            throw new DuplicatePagePathError(publicPath);
        }
        const page: TPage = {
            id: randomUUIDv7(),
            revision: 1,
            surface,
            ...(options.origin ? { origin: structuredClone(options.origin) } : {}),
            path: publicPath,
            ...(surface === "delivery" && language ? { paths: { [language]: path } } : {}),
            title,
            content,
            description: "",
            tags: [],
            visible: false,
        };
        this.pages.set(page.path, page);
        this.pageKeysById.set(page.id, page.path);
        this.indexPageContent(page);
        this.pageRoutes.set(page.path, {
            path: page.path,
            state: "current",
            pageId: page.id,
            ownerPageId: page.id,
            language: surface === "delivery" ? language : "",
        });
    }

    async getPageById(id: string): Promise<TPage | null> {
        const entry = this.findPageEntryById(id);
        return entry ? { ...entry[1] } : null;
    }

    async updatePage(page: Partial<TPage>, expectedRevision?: number): Promise<TPage | null> {
        if (!page.id) {
            throw new Error("updatePage requires `id` on the input.");
        }
        const entry = this.findPageEntryById(page.id);
        if (!entry) {
            return null;
        }
        let current = entry[1];
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
            throw new PageRevisionConflictError(expectedRevision, current.revision);
        }
        if (page.surface !== undefined && page.surface !== current.surface) {
            throw new ContentValidationError("surface", "cannot change after Page creation");
        }
        if (page.origin !== undefined) {
            throw new ContentValidationError("origin", "cannot change after Page creation");
        }
        if (page.path && page.path !== current.path) {
            const language = this.system.site.language;
            if (language) {
                current = await this.setPagePaths(
                    page.id,
                    { ...current.paths, [language]: page.path },
                    this.system,
                    undefined,
                    expectedRevision,
                );
            } else {
                throw new ContentValidationError(
                    "path",
                    "configure the default site language before changing a page URL",
                );
            }
        }
        const { revision: _revision, ...patch } = page;
        const merged: TPage = {
            ...current,
            ...patch,
            path: current.path,
            paths: current.paths,
            revision: current.revision + 1,
        };
        this.removePageContentIndex(current);
        this.pages.set(merged.path, merged);
        this.indexPageContent(merged);
        return { ...merged };
    }

    async setPagePaths(
        id: string,
        paths: Record<string, string>,
        system = this.system,
        expectedPaths?: Record<string, string>,
        expectedRevision?: number,
        duringRouteReconfiguration = false,
    ): Promise<TPage> {
        if (!duringRouteReconfiguration) {
            this.assertPageRoutesReady();
        }
        const entry = this.findPageEntryById(id);
        if (!entry) {
            throw new Error("Unknown page id.");
        }
        if (expectedRevision !== undefined && entry[1].revision !== expectedRevision) {
            throw new PageRevisionConflictError(expectedRevision, entry[1].revision);
        }
        if (expectedPaths && !samePagePaths(entry[1].paths ?? pagePathsForSystem(entry[1], system), expectedPaths)) {
            throw new PagePathsStaleError();
        }
        const plan = planPagePaths(paths, system);
        for (const { path } of plan.current) {
            const route = this.pageRoutes.get(path);
            if (route && !canUsePageRoute(route, id)) {
                throw new DuplicatePagePathError(path);
            }
        }
        const [oldPrimaryPath, page] = entry;
        const next = { ...page, path: plan.primaryPath, paths: plan.paths, revision: page.revision + 1 };
        for (const route of this.pageRoutes.values()) {
            if (
                route.pageId === id &&
                route.state === "current" &&
                !plan.current.some(({ path }) => path === route.path)
            ) {
                route.state = "redirect";
            }
        }
        for (const route of plan.current) {
            this.pageRoutes.set(route.path, { ...route, state: "current", pageId: id, ownerPageId: id });
        }
        this.pages.delete(oldPrimaryPath);
        this.pages.set(next.path, next);
        this.pageKeysById.set(id, next.path);
        return { ...next };
    }

    async deletePage(id: string, expectedRevision?: number): Promise<void> {
        return this.deletePageWithAlternative(id, null, expectedRevision);
    }

    async deletePageWithAlternative(
        id: string,
        alternativeId: string | null,
        expectedRevision?: number,
    ): Promise<void> {
        this.assertPageRoutesReady();
        const entry = this.findPageEntryById(id);
        if (!entry) {
            return;
        }
        if (expectedRevision !== undefined && entry[1].revision !== expectedRevision) {
            throw new PageRevisionConflictError(expectedRevision, entry[1].revision);
        }
        const alternative = alternativeId ? this.findPageEntryById(alternativeId)?.[1] : null;
        if (alternativeId && (!alternative || alternative.id === id || !alternative.visible)) {
            throw new Error("Alternative must be another published page.");
        }
        if (alternative) {
            for (const field of ["notFound", "forbidden", "serverError", "login"] as const) {
                if (this.system.site[field]?.pageId === id) {
                    this.system.site[field] = { kind: "site", pageId: alternative.id };
                }
            }
        }
        for (const route of this.pageRoutes.values()) {
            if (route.pageId !== id) {
                continue;
            }
            route.state = alternative ? "redirect" : "gone";
            if (alternative) {
                route.pageId = alternative.id;
            }
        }
        this.pages.delete(entry[0]);
        this.pageKeysById.delete(id);
        this.removePageContentIndex(entry[1]);
    }

    protected async reconfigurePageRoutes(
        system: TSystem,
        previousDefaultLanguage?: string,
        dryRun = false,
    ): Promise<void> {
        if (!system.site.language) {
            return;
        }
        const plans = [...this.pages.values()].map((page) => ({
            page,
            plan: planPagePaths(pagePathsForSystem(page, system, previousDefaultLanguage), system),
        }));
        const claims = new Map<string, string>();
        for (const { page, plan } of plans) {
            for (const { path } of plan.current) {
                const route = this.pageRoutes.get(path);
                const occupant = this.pages.get(path);
                const claimant = claims.get(path);
                if (
                    (claimant && claimant !== page.id) ||
                    (route && !canUsePageRoute(route, page.id)) ||
                    (occupant && occupant.id !== page.id)
                ) {
                    throw new DuplicatePagePathError(path);
                }
                claims.set(path, page.id);
            }
        }
        if (dryRun) {
            return;
        }
        for (const { page, plan } of plans) {
            await this.setPagePaths(page.id, plan.paths, system, undefined, undefined, true);
        }
    }

    private indexPageContent(page: TPage): void {
        for (const reference of pageContentReferenceKeys(page.content)) {
            const pageIds = this.pageIdsByContentReference.get(reference) ?? new Set<string>();
            pageIds.add(page.id);
            this.pageIdsByContentReference.set(reference, pageIds);
        }
    }

    private removePageContentIndex(page: TPage): void {
        for (const reference of pageContentReferenceKeys(page.content)) {
            const pageIds = this.pageIdsByContentReference.get(reference);
            pageIds?.delete(page.id);
            if (pageIds?.size === 0) {
                this.pageIdsByContentReference.delete(reference);
            }
        }
    }

    async getLinks(): Promise<PageLink[]> {
        return Array.from(this.pages.values()).map((page) => ({
            page: { kind: "site", pageId: page.id },
            path: page.path,
            title: page.title,
            surface: page.surface,
        }));
    }

    async getPagesMetadata(options: PagesQuery = {}): Promise<PageMeta[]> {
        return filterAndSortPages(
            Array.from(this.pages.values()).map((page) => ({
                id: page.id,
                path: page.path,
                title: page.title,
                tags: [...page.tags],
                visible: page.visible,
            })),
            options,
        );
    }

    private findPageEntryById(id: string): [string, TPage] | null {
        const path = this.pageKeysById.get(id);
        const page = path ? this.pages.get(path) : undefined;
        return path && page ? [path, page] : null;
    }

    private assertPageRoutesReady(): void {
        if (this.system.pageRoutesUpdating) {
            throw new Error("Page route migration is in progress.");
        }
    }
}

function requirePageScan(cursor: string | undefined, limit: number): void {
    if (
        (cursor !== undefined && (typeof cursor !== "string" || !cursor || cursor.length > 256)) ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 1_000
    ) {
        throw new TypeError("Page scan requires a valid cursor and a limit between 1 and 1000");
    }
}

function samePagePaths(left: Record<string, string>, right: Record<string, string>): boolean {
    return (
        Object.keys(left).length === Object.keys(right).length &&
        Object.entries(right).every(([language, path]) => left[language] === path)
    );
}

function canUsePageRoute(route: PageRoute, pageId: string): boolean {
    return (
        route.pageId === pageId &&
        ((route.state === "current" && route.ownerPageId === pageId) ||
            (route.state === "redirect" && route.ownerPageId === pageId))
    );
}
