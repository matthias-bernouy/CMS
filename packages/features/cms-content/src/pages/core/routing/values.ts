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

export function pageScopeKey(siteId: string, page: PageReference): string {
    return JSON.stringify([validateSiteId(siteId), pageReferenceKey(page)]);
}

function pageRouteKey(surface: PageSurface, path: string): string {
    return JSON.stringify([surface, validateSurfacePagePath(surface, path)]);
}

export function scopedPageRouteKey(siteId: string, surface: PageSurface, path: string): string {
    return JSON.stringify([validateSiteId(siteId), pageRouteKey(surface, path)]);
}

export function validateSiteId(siteId: string): string {
    if (typeof siteId !== "string" || !siteId || siteId !== siteId.trim() || siteId.length > 128) {
        throw new TypeError("A Page route site ID must be a nonempty bounded string.");
    }
    return siteId;
}

export function nextSurfacePageRoute(
    route: SurfacePageRoute,
    change: { readonly defaultPath?: string; readonly overridePath?: string | null },
): SurfacePageRoute {
    const defaultPath = validateSurfacePagePath(route.surface, change.defaultPath ?? route.defaultPath);
    const overridePath = change.overridePath === undefined ? route.overridePath : (change.overridePath ?? undefined);
    if (overridePath !== undefined) {
        validateSurfacePagePath(route.surface, overridePath);
    }
    return {
        ...route,
        defaultPath,
        ...(overridePath ? { overridePath } : { overridePath: undefined }),
        path: overridePath ?? defaultPath,
        revision: route.revision + 1,
    };
}

export function validateSurfacePagePath(surface: PageSurface, value: string): string {
    const path = validatePagePath(value);
    const controlPath = path === "/admin" || path.startsWith("/admin/");
    if ((surface === "control") !== controlPath) {
        throw new TypeError(
            surface === "control" ? "Control Pages must use /admin paths." : "Delivery Pages cannot use /admin paths.",
        );
    }
    if (
        surface === "delivery" &&
        ["/.cms", "/api", "/assets", "/auth", "/login"].some(
            (prefix) => path === prefix || path.startsWith(`${prefix}/`),
        )
    ) {
        throw new TypeError("Delivery Page path is reserved by the runtime.");
    }
    return path;
}

export function cloneSurfacePageRoute(route: SurfacePageRoute): SurfacePageRoute {
    return structuredClone(route);
}
