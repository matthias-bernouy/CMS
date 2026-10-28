import { resolvePageRouteTarget } from "cms-content/pages/core/queries/resolvePublishedRoute";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { validatePageReference } from "./values";
import { isSafeNavigationalUrl, normalizeInternalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
import { PageRouteNotFoundError } from "cms-content/pages/core/routing/errors";
import type { PageLinkTarget, PageRouteReader, ResolvedPageLink } from "cms-content/pages/interfaces/routing";
import type { PageRoute, TPage } from "cms-content/pages/interfaces/pages";
import { parseHTML } from "linkedom";

const MAX_PAGE_LINKS = 256;
const MAX_PAGE_LINK_LENGTH = 4096;

export async function resolvePageLinkTarget(
    routes: PageRouteReader,
    target: PageLinkTarget,
): Promise<ResolvedPageLink> {
    if (target.kind === "url") {
        if (!isSafeNavigationalUrl(target.url)) {
            throw new TypeError("The external Page link URL is unsafe.");
        }
        return { href: target.url, external: true };
    }
    const route = await routes.get(target.page);
    if (!route) {
        throw new PageRouteNotFoundError(target.page);
    }
    return { href: route.path, external: false };
}

export function createPageRouteReader(repository: {
    getPageRoute(path: string): Promise<PageRoute | null>;
    getPageById(id: string): Promise<TPage | null>;
    getSystem(): Promise<TSystem>;
}): PageRouteReader {
    return {
        get: async (reference) => {
            validatePageReference(reference);
            const page = await repository.getPageById(reference.pageId);
            return page ? { path: page.path } : null;
        },
        resolvePath: async (path) => {
            const route = await repository.getPageRoute(path);
            const page = route && route.state !== "gone" ? await repository.getPageById(route.pageId) : null;
            const target = page && route ? resolvePageRouteTarget(route, page, await repository.getSystem()) : null;
            return target ? { path: target.path } : null;
        },
    };
}

/** Rejects broken references before editable Page content is persisted. */
export async function assertPageContentLinks(
    routes: PageRouteReader,
    content: string,
    availablePaths: ReadonlySet<string> = new Set(),
): Promise<void> {
    for (const path of pageContentPaths(content)) {
        if (!availablePaths.has(path) && !(await routes.resolvePath(path))) {
            throw new TypeError(`Page content references an unavailable route: ${path}`);
        }
    }
}

export function pageContentPaths(content: string): readonly string[] {
    const { document } = parseHTML(`<body>${content}</body>`);
    const values = [
        ...Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"), (element) =>
            element.getAttribute("href"),
        ),
        ...Array.from(document.querySelectorAll<HTMLFormElement>("form[cms-mutation-redirect]"), (element) =>
            element.getAttribute("cms-mutation-redirect"),
        ),
    ];
    const frameValues = Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[src]"), (element) =>
        element.getAttribute("src"),
    );
    if (values.length + frameValues.length > MAX_PAGE_LINKS) {
        throw new TypeError("A Page contains too many links.");
    }
    return [
        ...new Set([
            ...values.flatMap((value) => authoredPagePath(value, false)),
            ...frameValues.flatMap((value) => authoredPagePath(value, true)),
        ]),
    ];
}

function authoredPagePath(value: string | null, includeTechnicalRoute: boolean): string[] {
    if (!value || value.length > MAX_PAGE_LINK_LENGTH) {
        return [];
    }
    const normalized = normalizeInternalUrl(value);
    if (normalized === null) {
        return [];
    }
    const path = normalized.split(/[?#]/u, 1)[0]!;
    return path.startsWith("/.cms/") && !includeTechnicalRoute ? [] : [path];
}
