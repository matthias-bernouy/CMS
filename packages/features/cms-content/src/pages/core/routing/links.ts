import { isSafeNavigationalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
import { PageRouteNotFoundError } from "cms-content/pages/core/routing/errors";
import type {
    PageLinkTarget,
    PageReference,
    PageRouteReader,
    ResolvedPageLink,
    PageRouteRegistry,
} from "cms-content/pages/interfaces/routing";
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

export function createPageRouteReader(
    routes: Pick<PageRouteRegistry, "get" | "resolve" | "resolveDefault">,
    siteId: string,
    siteRoutes?: {
        getPageRoute(path: string): Promise<PageRoute | null>;
        getPageById(id: string): Promise<TPage | null>;
    },
): PageRouteReader {
    return {
        get: (reference: PageReference) => routes.get(siteId, reference),
        resolvePath: async (path: string) => {
            const siteRoute = await siteRoutes?.getPageRoute(path);
            if (siteRoute?.state !== "gone") {
                const page = siteRoute ? await siteRoutes?.getPageById(siteRoute.pageId) : null;
                if (page) {
                    return {
                        page: { kind: "site", pageId: page.id },
                        defaultPath: page.path,
                        path: page.path,
                        ...(path === page.path ? {} : { aliases: [path] }),
                        revision: page.revision,
                    };
                }
            }
            return (await routes.resolve(siteId, path)) ?? (await routes.resolveDefault(siteId, path));
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
    if (values.length > MAX_PAGE_LINKS) {
        throw new TypeError("A Page contains too many links.");
    }
    return [...new Set(values.flatMap((value) => authoredPagePath(value)))];
}

function authoredPagePath(value: string | null): string[] {
    if (!value || value.length > MAX_PAGE_LINK_LENGTH || !value.startsWith("/") || value.startsWith("//")) {
        return [];
    }
    const path = value.split(/[?#]/u, 1)[0]!;
    return path.startsWith("/.cms/") ? [] : [path];
}
