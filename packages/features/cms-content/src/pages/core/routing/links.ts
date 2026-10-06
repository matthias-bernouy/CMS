import { isSafeNavigationalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { PageLinkSurfaceError, PageRouteNotFoundError } from "cms-content/pages/core/routing/errors";
import type {
    PageLinkTarget,
    PageReference,
    PageRouteReader,
    ResolvedPageLink,
    SurfacePageRouteRegistry,
} from "cms-content/pages/interfaces/routing";
import type { PageSurface } from "@bernouy/cms-repository/collections";

export async function resolvePageLinkTarget(
    routes: PageRouteReader,
    sourceSurface: PageSurface,
    target: PageLinkTarget,
): Promise<ResolvedPageLink> {
    if (target.kind === "url") {
        if (!isSafeNavigationalUrl(target.url)) {
            throw new TypeError("The external Page link URL is unsafe.");
        }
        return { href: target.url, surface: "external" };
    }
    const route = await routes.get(target.page);
    if (!route) {
        throw new PageRouteNotFoundError(target.page);
    }
    if (sourceSurface === "delivery" && route.surface === "control") {
        throw new PageLinkSurfaceError();
    }
    return { href: route.path, surface: route.surface };
}

export function createPageRouteReader(
    repository: Pick<CmsRepository, "getPageById">,
    collectionRoutes: Pick<SurfacePageRouteRegistry, "get">,
): PageRouteReader {
    return {
        async get(reference: PageReference) {
            if (reference.kind === "collection") {
                return collectionRoutes.get(reference);
            }
            const page = await repository.getPageById(reference.pageId);
            return page
                ? {
                      page: reference,
                      surface: page.surface,
                      defaultPath: page.path,
                      path: page.path,
                      revision: page.revision,
                  }
                : null;
        },
    };
}
