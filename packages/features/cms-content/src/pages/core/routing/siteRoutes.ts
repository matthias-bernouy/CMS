import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";
import type { SurfacePageRouteRegistry } from "cms-content/pages/interfaces/routing";
import {
    assertPageContentLinks,
    createPageRouteReader,
    pageContentReferences,
} from "cms-content/pages/core/routing/links";
import { PageRouteCollisionError } from "cms-content/pages/core/routing/errors";
import { planPagePaths } from "cms-content/pages/core/lifecycle/pagePaths";
import { PageRouteMutationCoordinator } from "cms-content/pages/core/routing/mutationCoordinator";
import {
    synchronizePageRouteRegistrations,
    synchronizePageRoutes,
} from "cms-content/pages/core/routing/synchronizeRoutes";

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
    routes: SurfacePageRouteRegistry,
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
                    const before = await target.getAllPages();
                    const installed = await target.getInstalledCollections?.();
                    if (installed) {
                        await synchronizePageRoutes(routes, siteId, installed, before);
                    }
                    await validateMutationLinks(target, routes, siteId, property, args);
                    const result = await Reflect.apply(value, target, args);
                    const pages = await target.getAllPages();
                    if (installed) {
                        await synchronizePageRoutes(
                            routes,
                            siteId,
                            (await target.getInstalledCollections?.()) ?? installed,
                            pages,
                        );
                    } else {
                        await synchronizeSitePageRoutes(routes, siteId, pages);
                    }
                    return result;
                });
            };
        },
    });
}

async function validateMutationLinks(
    repository: CmsRepository,
    routes: SurfacePageRouteRegistry,
    siteId: string,
    method: string,
    args: readonly unknown[],
): Promise<void> {
    const reader = createPageRouteReader(routes, siteId);
    if (method === "insertPage") {
        const content = typeof args[2] === "string" ? args[2] : "";
        const options = args[3] as { surface?: TPage["surface"] } | undefined;
        const surface = options?.surface ?? "delivery";
        await assertRouteAvailable(routes, siteId, surface, String(args[0]));
        await assertPageContentLinks(reader, surface, content);
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
                await assertRouteAvailable(routes, siteId, current.surface, patch.path, current.id);
            }
            await assertPageContentLinks(reader, current.surface, patch.content ?? current.content);
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
            await assertRouteAvailable(routes, siteId, current.surface, primaryPath, current.id);
        }
        return;
    }
    if (method === "deletePage" || method === "deletePageWithAlternative") {
        const pageId = String(args[0]);
        const sitePages = await repository.getAllPages();
        const installed = await repository.getInstalledCollections?.();
        const documents = [
            ...sitePages.filter((page) => page.id !== pageId).map((page) => page.content),
            ...(installed?.collections.flatMap(({ release }) =>
                (release.pages ?? []).map((page) => page.document.html),
            ) ?? []),
        ];
        if (
            documents.some((content) =>
                pageContentReferences(content).some(
                    (reference) => reference.kind === "site" && reference.pageId === pageId,
                ),
            )
        ) {
            throw Object.assign(new Error("A Page cannot be deleted while another Page references it"), {
                status: 409,
            });
        }
    }
}

async function assertRouteAvailable(
    routes: SurfacePageRouteRegistry,
    siteId: string,
    surface: TPage["surface"],
    path: string,
    ownerPageId?: string,
): Promise<void> {
    const occupied = await routes.resolve(siteId, surface, path);
    if (occupied && (occupied.page.kind !== "site" || occupied.page.pageId !== ownerPageId)) {
        throw new PageRouteCollisionError(path);
    }
}

/** Idempotently rebuilds the site-owned part of the shared surface route registry. */
export async function synchronizeSitePageRoutes(
    routes: SurfacePageRouteRegistry,
    siteId: string,
    pages: readonly TPage[],
): Promise<void> {
    const desired = pages.map((page) => ({
        page: { kind: "site" as const, pageId: page.id },
        surface: page.surface,
        defaultPath: page.path,
    }));
    await synchronizePageRouteRegistrations(routes, siteId, desired, (route) => route.page.kind === "site");
}

export async function validatePageLinks(
    repository: CmsRepository,
    routes: SurfacePageRouteRegistry,
    siteId: string,
): Promise<void> {
    const reader = createPageRouteReader(routes, siteId);
    for (const page of await repository.getAllPages()) {
        await assertPageContentLinks(reader, page.surface, page.content);
    }
    const installed = await repository.getInstalledCollections?.();
    for (const installation of installed?.collections ?? []) {
        for (const page of installation.release.pages ?? []) {
            await assertPageContentLinks(reader, page.surface, page.document.html);
        }
    }
}
