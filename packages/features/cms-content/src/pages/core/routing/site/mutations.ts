import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";
import type { SurfacePageRouteRegistry } from "cms-content/pages/interfaces/routing";

export async function pageBeforeMutation(
    repository: CmsRepository,
    method: string,
    args: readonly unknown[],
): Promise<TPage | null> {
    if (method === "insertPage") {
        return null;
    }
    if (method === "updatePage") {
        const id = (args[0] as Partial<TPage>).id;
        return id ? repository.getPageById(id) : null;
    }
    return repository.getPageById(String(args[0]));
}

export async function applySiteRouteMutation(
    repository: CmsRepository,
    routes: SurfacePageRouteRegistry,
    siteId: string,
    method: string,
    args: readonly unknown[],
    previous: TPage | null,
    result: unknown,
): Promise<void> {
    const deleted = method === "deletePage" || method === "deletePageWithAlternative";
    if (deleted && previous) {
        const reference = { kind: "site" as const, pageId: previous.id };
        const route = await routes.get(siteId, reference);
        if (route) {
            await routes.remove(siteId, reference, route.revision);
        }
        return;
    }
    const page =
        method === "insertPage"
            ? await repository.getPage(String(args[0]))
            : ((result as TPage | null) ?? (previous ? await repository.getPageById(previous.id) : null));
    if (!page) {
        return;
    }
    const reference = { kind: "site" as const, pageId: page.id };
    const route = await routes.get(siteId, reference);
    if (!route) {
        await routes.register(siteId, { page: reference, surface: page.surface, defaultPath: page.path });
    } else if (route.defaultPath !== page.path) {
        await routes.updateDefault(siteId, reference, page.path, route.revision);
    }
}
