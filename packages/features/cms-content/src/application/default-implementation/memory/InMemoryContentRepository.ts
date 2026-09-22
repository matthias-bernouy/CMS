import { randomUUIDv7 } from "bun";
import type { PageLink, PageMeta, PagesQuery } from "cms-content/application/interfaces/CmsRepository";
import type { PageRoute, TPage } from "cms-content/pages/interfaces/pages";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { defaultSystem } from "cms-content/settings/core/system";
import { filterAndSortPages } from "cms-content/pages/core/queries/pagesQuery";
import { isPublishedPage } from "cms-content/pages/core/lifecycle/publication";
import { InMemoryBlocRepository } from "cms-content/application/default-implementation/memory/InMemoryBlocRepository";
import {
    ContentValidationError,
    DuplicatePagePathError,
    PagePathsStaleError,
} from "cms-content/application/core/validation/errors";
import { pagePathsForSystem, planPagePaths } from "cms-content/pages/core/lifecycle/pagePaths";
import { publicPagePath } from "cms-content/pages/core/paths/localizedPagePath";

export class InMemoryContentRepository extends InMemoryBlocRepository {
    protected readonly pages = new Map<string, TPage>();
    private readonly pageKeysById = new Map<string, string>();
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

    async getPublishedPage(path: string): Promise<TPage | null> {
        if (this.pageRoutes.get(path)?.state === "gone") {
            return null;
        }
        const page = await this.getPage(path);
        return isPublishedPage(page) ? page : null;
    }

    async getPublishedPages(): Promise<TPage[]> {
        return (await this.getAllPages()).filter(isPublishedPage);
    }

    async insertPage(path: string, title: string, content = "<p></p>"): Promise<void> {
        this.assertPageRoutesReady();
        const language = this.system.site.language;
        const publicPath = publicPagePath(language, path, language);
        if (this.pageRoutes.has(publicPath) || this.pages.has(publicPath)) {
            throw new DuplicatePagePathError(publicPath);
        }
        const page: TPage = {
            id: randomUUIDv7(),
            path: publicPath,
            ...(language ? { paths: { [language]: path } } : {}),
            title,
            content,
            description: "",
            tags: [],
            visible: false,
        };
        this.pages.set(page.path, page);
        this.pageKeysById.set(page.id, page.path);
        this.pageRoutes.set(page.path, {
            path: page.path,
            state: "current",
            pageId: page.id,
            ownerPageId: page.id,
            language,
        });
    }

    async getPageById(id: string): Promise<TPage | null> {
        const entry = this.findPageEntryById(id);
        return entry ? { ...entry[1] } : null;
    }

    async updatePage(page: Partial<TPage>): Promise<void> {
        if (!page.id) {
            throw new Error("updatePage requires `id` on the input.");
        }
        const entry = this.findPageEntryById(page.id);
        if (!entry) {
            return;
        }
        let current = entry[1];
        if (page.path && page.path !== current.path) {
            const language = this.system.site.language;
            if (language) {
                current = await this.setPagePaths(page.id, { ...current.paths, [language]: page.path });
            } else {
                throw new ContentValidationError(
                    "path",
                    "configure the default site language before changing a page URL",
                );
            }
        }
        const merged: TPage = { ...current, ...page, path: current.path, paths: current.paths };
        this.pages.set(merged.path, merged);
    }

    async setPagePaths(
        id: string,
        paths: Record<string, string>,
        system = this.system,
        expectedPaths?: Record<string, string>,
        duringRouteReconfiguration = false,
    ): Promise<TPage> {
        if (!duringRouteReconfiguration) {
            this.assertPageRoutesReady();
        }
        const entry = this.findPageEntryById(id);
        if (!entry) {
            throw new Error("Unknown page id.");
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
        const next = { ...page, path: plan.primaryPath, paths: plan.paths };
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

    async deletePage(id: string): Promise<void> {
        return this.deletePageWithAlternative(id, null);
    }

    async deletePageWithAlternative(id: string, alternativeId: string | null): Promise<void> {
        this.assertPageRoutesReady();
        const entry = this.findPageEntryById(id);
        if (!entry) {
            return;
        }
        const alternative = alternativeId ? this.findPageEntryById(alternativeId)?.[1] : null;
        if (alternativeId && (!alternative || alternative.id === id || !alternative.visible)) {
            throw new Error("Alternative must be another published page.");
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
            await this.setPagePaths(page.id, plan.paths, system, undefined, true);
        }
    }

    async getLinks(): Promise<PageLink[]> {
        return Array.from(this.pages.values()).map((page) => ({ path: page.path, title: page.title }));
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
