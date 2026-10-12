import { isSafeNavigationalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
import { PageRouteNotFoundError } from "cms-content/pages/core/routing/errors";
import type {
    PageLinkTarget,
    PageReference,
    PageRouteReader,
    ResolvedPageLink,
    PageRouteRegistry,
} from "cms-content/pages/interfaces/routing";
import { parseHTML } from "linkedom";
import { validatePageReference } from "cms-content/pages/core/routing/values";

const MAX_PAGE_LINKS = 256;
const MAX_PAGE_REFERENCE_LENGTH = 1024;

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

export function createPageRouteReader(routes: Pick<PageRouteRegistry, "get">, siteId: string): PageRouteReader {
    return {
        get: (reference: PageReference) => routes.get(siteId, reference),
    };
}

/** Rejects broken references before editable Page content is persisted. */
export async function assertPageContentLinks(routes: PageRouteReader, content: string): Promise<void> {
    for (const reference of pageContentReferences(content)) {
        await resolvePageLinkTarget(routes, { kind: "page", page: reference });
    }
}

export function pageContentReferences(content: string): readonly PageReference[] {
    const { document } = parseHTML(`<body>${content}</body>`);
    const elements = [
        ...document.querySelectorAll<HTMLElement>("[data-cms-page-ref]"),
        ...document.querySelectorAll<HTMLElement>("[data-cms-success-page-ref]"),
    ];
    if (elements.length > MAX_PAGE_LINKS) {
        throw new TypeError("A Page contains too many stable Page references.");
    }
    return elements.map((element) => {
        const raw = element.getAttribute("data-cms-page-ref") ?? element.getAttribute("data-cms-success-page-ref");
        if (!raw || raw.length > MAX_PAGE_REFERENCE_LENGTH) {
            throw new TypeError("A stable Page reference is invalid.");
        }
        try {
            return validatePageReference(JSON.parse(raw) as PageReference);
        } catch {
            throw new TypeError("A stable Page reference is invalid.");
        }
    });
}
