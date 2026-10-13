import type { PageReference, RegisteredPageRoute } from "cms-content/pages/interfaces/routing";
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
    if (!identifier.test(page.sourceId) || !identifier.test(page.contributionId) || !identifier.test(page.pageId)) {
        throw new TypeError("A contributed Page reference must contain valid qualified identifiers.");
    }
    return { ...page };
}

export function pageReferenceKey(page: PageReference): string {
    const value = validatePageReference(page);
    return value.kind === "site"
        ? JSON.stringify(["site", value.pageId])
        : JSON.stringify(["contribution", value.sourceId, value.contributionId, value.pageId]);
}

export function pageScopeKey(siteId: string, page: PageReference): string {
    return JSON.stringify([validateSiteId(siteId), pageReferenceKey(page)]);
}

export function scopedPageRouteKey(siteId: string, path: string): string {
    return JSON.stringify([validateSiteId(siteId), validateRegisteredPagePath(path)]);
}

export function validateSiteId(siteId: string): string {
    if (typeof siteId !== "string" || !siteId || siteId !== siteId.trim() || siteId.length > 128) {
        throw new TypeError("A Page route site ID must be a nonempty bounded string.");
    }
    return siteId;
}

export function nextPageRoute(
    route: RegisteredPageRoute,
    change: { readonly defaultPath?: string; readonly overridePath?: string | null },
): RegisteredPageRoute {
    const defaultPath = validateRegisteredPagePath(change.defaultPath ?? route.defaultPath);
    const overridePath = change.overridePath === undefined ? route.overridePath : (change.overridePath ?? undefined);
    if (overridePath !== undefined) {
        validateRegisteredPagePath(overridePath);
    }
    return {
        ...route,
        defaultPath,
        ...(overridePath ? { overridePath } : { overridePath: undefined }),
        path: overridePath ?? defaultPath,
        revision: route.revision + 1,
    };
}

export function validateRegisteredPagePath(value: string): string {
    const path = validatePagePath(value);
    if (["/.cms", "/api", "/assets", "/auth"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
        throw new TypeError("Page path is reserved by the kernel.");
    }
    return path;
}

export function clonePageRoute(route: RegisteredPageRoute): RegisteredPageRoute {
    return structuredClone(route);
}
