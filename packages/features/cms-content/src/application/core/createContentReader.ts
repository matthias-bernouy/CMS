import type { RenderingResourceReads } from "./RenderingResourceReads";
import {
    readPublishedRoute,
    resolvePublishedRoute,
    resolvePageRouteTarget,
} from "cms-content/pages/core/queries/resolvePublishedRoute";
import { projectRenderingSettings } from "cms-content/settings/core/renderingSettings";
import { projectPublishedPage } from "cms-content/pages/core/queries/publishedPage";
import type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";
import type {
    ContentReader,
    RenderableBloc,
    RenderablePage,
    PublishedRouteResolution,
} from "cms-content/application/interfaces/ContentReader";
import type { PageRoute, TPage } from "cms-content/pages/interfaces/pages";
import { validatePageReference } from "cms-content/pages/core/routing/values";
import { installPageRenderInputReaders } from "cms-content/application/core/pageRenderInputs";

/** Public delivery reads only site-owned Pages and installed rendering resources. */
export function createContentReader(repository: ContentRepository): ContentReader {
    const sitePage = async (page: TPage, reads?: RenderingResourceReads): Promise<RenderablePage> => ({
        reference: { kind: "site", pageId: page.id },
        page,
        source: { kind: "site", pageId: page.id, revision: page.revision },
        requirements: [...((await repository.getPageRequirements?.(page, reads)) ?? [])],
    });
    const getRenderablePage = async (path: string): Promise<RenderablePage | null> => {
        const page = projectPublishedPage(await repository.getPublishedPage(path));
        return page ? sitePage(page) : null;
    };
    const getRenderablePages = async () =>
        Promise.all(
            (await repository.getPublishedPages())
                .map(projectPublishedPage)
                .filter((page): page is TPage => page !== null)
                .map((page) => sitePage(page)),
        );
    const getContentTexts = async () => [...((await repository.getTextContributions?.())?.texts ?? [])];
    const getRenderingSettings = async () => projectRenderingSettings(await repository.getSystem());
    const getRenderableBlocs = async (reads?: RenderingResourceReads): Promise<RenderableBloc[]> =>
        (await repository.getBlocsList({ includeHidden: true, projection: "rendering" }, reads)).map((bloc) => ({
            id: bloc.id,
            kind: bloc.kind,
            markupHTML: bloc.markupHTML,
            ...(bloc.browser ? { browser: bloc.browser } : {}),
            ...(bloc.uses?.length ? { uses: [...bloc.uses] } : {}),
            root: bloc.root,
            ...(bloc.styleCSS ? { styleCSS: bloc.styleCSS } : {}),
            ...(bloc.styleCollectionId ? { styleCollectionId: bloc.styleCollectionId } : {}),
            hasBehavior: bloc.hasBehavior,
        }));
    const renderableRoute = async (route: PublishedRouteResolution | null, reads?: RenderingResourceReads) => {
        if (route?.kind !== "current") {
            return route;
        }
        const page = projectPublishedPage(route.page);
        return page ? { ...route, page: await sitePage(page, reads) } : { kind: "unavailable" as const };
    };
    const routeWithSettings = async (path: string, reads?: RenderingResourceReads) => {
        const { route, system } = await readPublishedRoute(path, repository, reads);
        return { route: await renderableRoute(route, reads), settings: projectRenderingSettings(system) };
    };
    const reader: ContentReader = {
        getContentRevision: async () => (await repository.getTextContributions?.())?.revision ?? 0,
        getContentTexts,
        getRenderablePage,
        getRenderablePages,
        resolvePageReference: async (reference) => {
            validatePageReference(reference);
            return projectPublishedPage(await repository.getPublishedPageById(reference.pageId))?.path ?? null;
        },
        resolvePagePaths: async (paths) => {
            const system = await repository.getSystem();
            const unique = [...new Set(paths)];
            const routes = repository.getPageRoutes
                ? await repository.getPageRoutes(unique)
                : (await Promise.all(unique.map((path) => repository.getPageRoute(path)))).filter(
                      (route): route is PageRoute => route !== null,
                  );
            const ids = [...new Set(routes.filter((route) => route.state !== "gone").map((route) => route.pageId))];
            const pages = repository.getPublishedPagesByIds
                ? await repository.getPublishedPagesByIds(ids)
                : (await Promise.all(ids.map((id) => repository.getPublishedPageById(id)))).filter(
                      (page): page is TPage => page !== null,
                  );
            const published = new Map(pages.map((page) => [page.id, projectPublishedPage(page)]));
            return Object.fromEntries(
                routes.flatMap((route) => {
                    const page = route.state !== "gone" ? published.get(route.pageId) : null;
                    const target = page ? resolvePageRouteTarget(route, page, system) : null;
                    return target ? [[route.path, target.path]] : [];
                }),
            );
        },
        resolveRenderableRoute: async (path) => renderableRoute(await resolvePublishedRoute(path, repository)),
        getPublishedPage: async (path) => projectPublishedPage(await repository.getPublishedPage(path)),
        getPublishedPageById: async (id) => projectPublishedPage(await repository.getPublishedPageById(id)),
        getPublishedPages: async () => (await getRenderablePages()).map(({ page }) => page),
        resolvePublishedRoute: async (path) => {
            const route = await resolvePublishedRoute(path, repository);
            if (route?.kind !== "current") {
                return route;
            }
            const page = projectPublishedPage(route.page);
            return page ? { ...route, page } : { kind: "unavailable" };
        },
        getRenderableBlocs,
        getBlocViewJS: (tag) => repository.getBlocViewJS(tag),
        getBlocViewsJS: (tags) => repository.getBlocViewsJS(tags),
        getRenderingSettings,
    };
    installPageRenderInputReaders(reader, repository, { routeWithSettings, getContentTexts, getRenderableBlocs });
    return reader;
}
