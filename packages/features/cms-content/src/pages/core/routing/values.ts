import type { PageReference, SurfacePageRoute } from "cms-content/pages/interfaces/routing";
import type { PageSurface } from "@bernouy/cms-repository/collections";
import { validatePagePath } from "cms-content/pages/core/validation/page";

const identifier = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const sitePageId = /^[0-9A-Za-z][0-9A-Za-z._:-]{0,199}$/u;

export function validatePageReference(page: PageReference): PageReference {
    if (page.kind === "site") {
        if (!sitePageId.test(page.pageId)) {
            throw new TypeError("A site Page reference must contain a valid Page ID.");
        }
        return { kind: "site", pageId: page.pageId };
    }
    if (!identifier.test(page.publisherId) || !identifier.test(page.collectionId) || !identifier.test(page.pageId)) {
        throw new TypeError("A collection Page reference must contain valid qualified identifiers.");
    }
    return { ...page };
}

export function pageReferenceKey(page: PageReference): string {
    const value = validatePageReference(page);
    return value.kind === "site"
        ? JSON.stringify(["site", value.pageId])
        : JSON.stringify(["collection", value.publisherId, value.collectionId, value.pageId]);
}

export function pageRouteKey(surface: PageSurface, path: string): string {
    return JSON.stringify([surface, validatePagePath(path)]);
}

export function nextSurfacePageRoute(
    route: SurfacePageRoute,
    change: { readonly defaultPath?: string; readonly overridePath?: string | null },
): SurfacePageRoute {
    const defaultPath = validatePagePath(change.defaultPath ?? route.defaultPath);
    const overridePath = change.overridePath === undefined ? route.overridePath : (change.overridePath ?? undefined);
    if (overridePath !== undefined) {
        validatePagePath(overridePath);
    }
    return {
        ...route,
        defaultPath,
        ...(overridePath ? { overridePath } : { overridePath: undefined }),
        path: overridePath ?? defaultPath,
        revision: route.revision + 1,
    };
}

export function cloneSurfacePageRoute(route: SurfacePageRoute): SurfacePageRoute {
    return structuredClone(route);
}
