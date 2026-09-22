import { publicPagePath } from "cms-content/pages/core/paths/localizedPagePath";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { PublishedRouteResolution } from "cms-content/application/interfaces/ContentReader";
import type { TSystem } from "cms-content/settings/interfaces/settings";

type PublishedRouteRepository = Pick<CmsRepository, "getPageById" | "getPageRoute" | "getSystem">;

/** Resolves stored routes without ever returning a hidden page. */
export async function resolvePublishedRoute(
    path: string,
    repository: PublishedRouteRepository,
): Promise<PublishedRouteResolution | null> {
    const before = await repository.getSystem();
    if (before.pageRoutesUpdating) {
        return { kind: "updating" };
    }
    const route = await repository.getPageRoute(path);
    if (!route) {
        const after = await repository.getSystem();
        if (after.pageRoutesUpdating || languageConfigurationChanged(before, after)) {
            return { kind: "updating" };
        }
        return null;
    }
    if (route.state === "gone") {
        return { kind: "gone", language: route.language };
    }
    const page = await repository.getPageById(route.pageId);
    const finalRoute = await repository.getPageRoute(path);
    const system = await repository.getSystem();
    if (system.pageRoutesUpdating || languageConfigurationChanged(before, system)) {
        return { kind: "updating" };
    }
    if (
        finalRoute?.state !== route.state ||
        finalRoute?.pageId !== route.pageId ||
        finalRoute?.language !== route.language
    ) {
        return { kind: "updating" };
    }
    if (page?.visible !== true) {
        return { kind: "unavailable" };
    }
    const requestedLanguage = route.language || system.site.language;
    const active =
        requestedLanguage === system.site.language || (system.site.activeLanguages ?? []).includes(requestedLanguage);
    if (!active && route.state === "current") {
        return { kind: "unavailable" };
    }
    const language =
        route.state === "redirect" && (!active || (page.paths && !page.paths[requestedLanguage]))
            ? system.site.language
            : requestedLanguage;
    const local = page.paths?.[language];
    const currentPath = local ? publicPagePath(language, local, system.site.language) : page.paths ? null : page.path;
    if (!currentPath) {
        return { kind: "unavailable" };
    }
    if (route.state === "redirect" || currentPath !== path) {
        return { kind: "redirect", path: currentPath };
    }
    return { kind: "current", page: structuredClone({ ...page, path }), language };
}

function languageConfigurationChanged(before: TSystem, after: TSystem): boolean {
    if (before.site.language !== after.site.language) {
        return true;
    }
    const previous = before.site.additionalLanguages ?? [];
    const next = after.site.additionalLanguages ?? [];
    return previous.length !== next.length || previous.some((language) => !next.includes(language));
}
