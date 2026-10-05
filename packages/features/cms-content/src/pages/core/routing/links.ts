import { isSafeNavigationalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
import { PageLinkSurfaceError, PageRouteNotFoundError } from "cms-content/pages/core/routing/errors";
import type { PageLinkTarget, ResolvedPageLink, SurfacePageRouteRegistry } from "cms-content/pages/interfaces/routing";
import type { PageSurface } from "@bernouy/cms-repository/collections";

export async function resolvePageLinkTarget(
    registry: SurfacePageRouteRegistry,
    sourceSurface: PageSurface,
    target: PageLinkTarget,
): Promise<ResolvedPageLink> {
    if (target.kind === "url") {
        if (!isSafeNavigationalUrl(target.url)) {
            throw new TypeError("The external Page link URL is unsafe.");
        }
        return { href: target.url, surface: "external" };
    }
    const route = await registry.get(target.page);
    if (!route) {
        throw new PageRouteNotFoundError(target.page);
    }
    if (sourceSurface === "delivery" && route.surface === "control") {
        throw new PageLinkSurfaceError();
    }
    return { href: route.path, surface: route.surface };
}
