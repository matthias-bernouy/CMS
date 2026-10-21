import type { PageReference, RegisteredPageRoute } from "cms-content/pages/interfaces/routing";
import type { PageRoute } from "cms-content/pages/interfaces/pages";
import { validatePagePath } from "cms-content/pages/core/validation/page";
import { isValidPathFormat } from "cms-content/application/core/validation/predicates";

const identifier = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const sitePageId = /^[0-9A-Za-z][0-9A-Za-z._:-]{0,199}$/u;
const RESERVED_PAGE_PATH_PREFIXES = ["/.cms", "/api", "/assets", "/auth"] as const;

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
    const path = overridePath ?? defaultPath;
    const aliases = [...new Set([...(route.aliases ?? []), route.defaultPath, route.path])]
        .filter((candidate) => candidate !== defaultPath && candidate !== path)
        .sort();
    return {
        ...route,
        defaultPath,
        ...(overridePath ? { overridePath } : { overridePath: undefined }),
        path,
        ...(aliases.length > 0 ? { aliases } : { aliases: undefined }),
        revision: route.revision + 1,
    };
}

export function pageRouteClaims(route: Pick<RegisteredPageRoute, "defaultPath" | "path" | "aliases">): string[] {
    return [...new Set([route.defaultPath, route.path, ...(route.aliases ?? [])])].sort();
}

export function validateRegisteredPagePath(value: string): string {
    const path = validatePagePath(value);
    if (isReservedPagePath(path)) {
        throw new TypeError("Page path is reserved by the kernel.");
    }
    return path;
}

/** Non-throwing request-boundary check for paths that can exist in the Page route registry. */
export function isValidRegisteredPagePath(value: string): boolean {
    return isValidPathFormat(value) && !isReservedPagePath(value);
}

function isReservedPagePath(path: string): boolean {
    return RESERVED_PAGE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function clonePageRoute(route: RegisteredPageRoute): RegisteredPageRoute {
    return structuredClone(route);
}

export function canUsePageRoute(route: Pick<PageRoute, "pageId" | "ownerPageId" | "state">, pageId: string): boolean {
    return (
        route.pageId === pageId &&
        ((route.state === "current" && route.ownerPageId === pageId) ||
            (route.state === "redirect" && route.ownerPageId === pageId))
    );
}

export function samePagePaths(
    left: Readonly<Record<string, string>> | undefined,
    right: Readonly<Record<string, string>>,
): boolean {
    return (
        left !== undefined &&
        Object.keys(left).length === Object.keys(right).length &&
        Object.entries(right).every(([language, path]) => left[language] === path)
    );
}

export function requirePageScan(cursor: string | undefined, limit: number): void {
    if (
        (cursor !== undefined && (typeof cursor !== "string" || !cursor || cursor.length > 256)) ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 1_000
    ) {
        throw new TypeError("Page scan requires a valid cursor and a limit between 1 and 1000");
    }
}
