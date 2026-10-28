import type { PageReference } from "cms-content/pages/interfaces/routing";
import type { PageRoute } from "cms-content/pages/interfaces/pages";
import { isValidPathFormat } from "cms-content/application/core/validation/predicates";

const sitePageId = /^[0-9A-Za-z][0-9A-Za-z._:-]{0,199}$/u;
const RESERVED_PAGE_PATH_PREFIXES = ["/.cms", "/api", "/assets", "/auth"] as const;

export function validatePageReference(page: PageReference): PageReference {
    if (
        !page ||
        page.kind !== "site" ||
        typeof page.pageId !== "string" ||
        !sitePageId.test(page.pageId) ||
        Object.keys(page).some((key) => key !== "kind" && key !== "pageId")
    ) {
        throw new TypeError("Only valid site-owned Page references are supported");
    }
    return { kind: "site", pageId: page.pageId };
}

export function isValidRegisteredPagePath(value: string): boolean {
    return isValidPathFormat(value) && !isReservedPagePath(value);
}
function isReservedPagePath(path: string): boolean {
    return RESERVED_PAGE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
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
