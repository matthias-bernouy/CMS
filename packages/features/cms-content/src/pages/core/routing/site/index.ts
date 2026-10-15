import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";
import type { PageRouteRegistry } from "cms-content/pages/interfaces/routing";
import { assertPageContentLinks, createPageRouteReader, pageContentPaths } from "cms-content/pages/core/routing/links";
import { PageRouteCollisionError } from "cms-content/pages/core/routing/errors";
import { planPagePaths } from "cms-content/pages/core/lifecycle/pagePaths";
import { PageRouteMutationCoordinator } from "cms-content/pages/core/routing/mutationCoordinator";
import { synchronizePageRouteRegistrations } from "cms-content/pages/core/routing/synchronizeRoutes";
import { applySiteRouteMutation, pageBeforeMutation } from "cms-content/pages/core/routing/site/mutations";

const PAGE_ROUTE_MUTATIONS = new Set([
    "insertPage",
    "updatePage",
    "deletePage",
    "setPagePaths",
    "deletePageWithAlternative",
]);

/** Reconciles editable Page routes after every canonical Page mutation. */
export function withSitePageRoutes(
    repository: CmsRepository,
    routes: PageRouteRegistry,
    siteId: string,
    coordinator = new PageRouteMutationCoordinator(),
): CmsRepository {
    return new Proxy(repository, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof property !== "string" || typeof value !== "function") {
                return value;
            }
            if (!PAGE_ROUTE_MUTATIONS.has(property)) {
                return value.bind(target);
            }
            return (...args: unknown[]) => {
                return coordinator.run(siteId, async () => {
                    await validateMutationLinks(target, routes, siteId, property, args);
                    const previous = await pageBeforeMutation(target, property, args);
                    const result = await Reflect.apply(value, target, args);
                    await applySiteRouteMutation(target, routes, siteId, property, args, previous, result);
                    return result;
                });
            };
        },
    });
}

async function validateMutationLinks(
    repository: CmsRepository,
    routes: PageRouteRegistry,
    siteId: string,
    method: string,
    args: readonly unknown[],
): Promise<void> {
    const reader = createPageRouteReader(routes, siteId, repository);
    if (method === "insertPage") {
        const content = typeof args[2] === "string" ? args[2] : "";
        const path = String(args[0]);
        await assertRouteAvailable(routes, siteId, path);
        await assertPageContentLinks(reader, content, new Set([path]));
        return;
    }
    if (method === "updatePage") {
        const patch = args[0] as Partial<TPage>;
        if (!patch.id) {
            return;
        }
        const current = await repository.getPageById(patch.id);
        if (current) {
            if (patch.path && patch.path !== current.path) {
                await assertRouteAvailable(routes, siteId, patch.path, current.id);
            }
            await assertPageContentLinks(
                reader,
                patch.content ?? current.content,
                new Set(patch.path ? [patch.path] : []),
            );
        }
        return;
    }
    if (method === "setPagePaths") {
        const current = await repository.getPageById(String(args[0]));
        if (current) {
            const system =
                (args[2] as Awaited<ReturnType<CmsRepository["getSystem"]>> | undefined) ??
                (await repository.getSystem());
            const primaryPath = planPagePaths(args[1] as Record<string, string>, system).primaryPath;
            await assertRouteAvailable(routes, siteId, primaryPath, current.id);
        }
        return;
    }
    if (method === "deletePage" || method === "deletePageWithAlternative") {
        const pageId = String(args[0]);
        const contributions = await repository.getContentContributions?.();
        const referencesTarget = async (content: string): Promise<boolean> => {
            for (const path of pageContentPaths(content)) {
                const route = await repository.getPageRoute(path);
                if (route?.pageId === pageId) {
                    return true;
                }
            }
            return false;
        };
        let cursor: string | undefined;
        do {
            const batch = await repository.scanPages(cursor, 250);
            for (const page of batch.pages) {
                if (page.id !== pageId && (await referencesTarget(page.content))) {
                    throwReferencedPage();
                }
            }
            cursor = batch.nextCursor;
        } while (cursor);
        for (const { page } of contributions?.pages ?? []) {
            if (await referencesTarget(page.content)) {
                throwReferencedPage();
            }
        }
    }
}

function throwReferencedPage(): never {
    throw Object.assign(new Error("A Page cannot be deleted while another Page references it"), {
        status: 409,
    });
}

async function assertRouteAvailable(
    routes: PageRouteRegistry,
    siteId: string,
    path: string,
    ownerPageId?: string,
): Promise<void> {
    const occupied = await routes.resolve(siteId, path);
    if (occupied && (occupied.page.kind !== "site" || occupied.page.pageId !== ownerPageId)) {
        throw new PageRouteCollisionError(path);
    }
}

/** Idempotently rebuilds the site-owned part of the shared Page route registry. */
export async function synchronizeSitePageRoutes(
    routes: PageRouteRegistry,
    siteId: string,
    pages: readonly TPage[],
): Promise<void> {
    const desired = pages.map((page) => ({
        page: { kind: "site" as const, pageId: page.id },
        defaultPath: page.path,
    }));
    await synchronizePageRouteRegistrations(routes, siteId, desired, (route) => route.page.kind === "site");
}

export async function validatePageLinks(
    repository: CmsRepository,
    routes: PageRouteRegistry,
    siteId: string,
): Promise<void> {
    const reader = createPageRouteReader(routes, siteId, repository);
    for (const page of await repository.getAllPages()) {
        await assertPageContentLinks(reader, page.content);
    }
    const contributions = await repository.getContentContributions?.();
    for (const page of contributions?.pages ?? []) {
        await assertPageContentLinks(reader, page.page.content);
    }
}
