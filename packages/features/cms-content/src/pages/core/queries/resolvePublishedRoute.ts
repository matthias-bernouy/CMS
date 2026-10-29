import type { RenderingResourceReads } from "cms-content/application/core/RenderingResourceReads";
import type { TPage, PageRoute } from "cms-content/pages/interfaces/pages";
import { publicPagePath } from "cms-content/pages/core/paths/localizedPagePath";
import type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";
import type { PublishedRouteResolution } from "cms-content/application/interfaces/ContentReader";
import type { TSystem } from "cms-content/settings/interfaces/settings";

type PublishedRouteRepository = Pick<ContentRepository, "getPageById" | "getPageRoute" | "getSystem">;

/** Resolves stored routes without ever returning a hidden page. */
export async function resolvePublishedRoute(
    path: string,
    repository: PublishedRouteRepository,
): Promise<PublishedRouteResolution | null> {
    return (await readPublishedRoute(path, repository)).route;
}

/** Return the final checked settings with the route so rendering need not read them a third time. */
export async function readPublishedRoute(
    path: string,
    repository: PublishedRouteRepository,
    reads?: RenderingResourceReads,
): Promise<{ route: PublishedRouteResolution | null; system: TSystem }> {
    const before = await repository.getSystem(reads);
    if (before.pageRoutesUpdating) {
        return { route: { kind: "updating" }, system: before };
    }
    const route = await repository.getPageRoute(path);
    if (!route) {
        const after = await repository.getSystem(reads);
        if (after.pageRoutesUpdating || languageConfigurationChanged(before, after)) {
            return { route: { kind: "updating" }, system: after };
        }
        return { route: null, system: after };
    }
    if (route.state === "gone") {
        return { route: { kind: "gone", language: route.language }, system: before };
    }
    const page = await repository.getPageById(route.pageId);
    const finalRoute = await repository.getPageRoute(path);
    const system = await repository.getSystem(reads);
    if (system.pageRoutesUpdating || languageConfigurationChanged(before, system)) {
        return { route: { kind: "updating" }, system };
    }
    if (
        finalRoute?.state !== route.state ||
        finalRoute?.pageId !== route.pageId ||
        finalRoute?.language !== route.language
    ) {
        return { route: { kind: "updating" }, system };
    }
    if (page?.visible !== true) {
        return { route: { kind: "unavailable" }, system };
    }
    const target = resolvePageRouteTarget(route, page, system);
    if (!target) {
        return { route: { kind: "unavailable" }, system };
    }
    if (route.state === "redirect" || target.path !== path) {
        return { route: { kind: "redirect", path: target.path }, system };
    }
    return { route: { kind: "current", page: structuredClone({ ...page, path }), language: target.language }, system };
}

/** Resolve a native Content route while preserving its language and redirect semantics. */
export function resolvePageRouteTarget(
    route: PageRoute,
    page: TPage,
    system: TSystem,
): { path: string; language: string } | null {
    if (route.state === "gone" || system.pageRoutesUpdating) {
        return null;
    }
    const requestedLanguage = route.language || system.site.language;
    const active =
        requestedLanguage === system.site.language || (system.site.activeLanguages ?? []).includes(requestedLanguage);
    if (!active && route.state === "current") {
        return null;
    }
    const language =
        route.state === "redirect" && (!active || (page.paths && !page.paths[requestedLanguage]))
            ? system.site.language
            : requestedLanguage;
    const local = page.paths?.[language];
    const currentPath = local ? publicPagePath(language, local, system.site.language) : page.paths ? null : page.path;
    if (!currentPath) {
        return null;
    }
    return { path: currentPath, language };
}

function languageConfigurationChanged(before: TSystem, after: TSystem): boolean {
    if (before.site.language !== after.site.language) {
        return true;
    }
    const previous = before.site.additionalLanguages ?? [];
    const next = after.site.additionalLanguages ?? [];
    return previous.length !== next.length || previous.some((language) => !next.includes(language));
}
