import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { ContentReader, PageRenderInputs, RenderableBloc } from "cms-content/application/interfaces/ContentReader";
import type { ContentTextSource } from "cms-content/pages/core/rendering/contentTexts";
import type { RenderingSettings } from "cms-content/settings/interfaces/settings";

type RenderInputLoaders = {
    getRenderingSettings(): Promise<RenderingSettings>;
    getContentTexts(): Promise<ContentTextSource[]>;
    getRenderableBlocs(): Promise<RenderableBloc[]>;
};

export function installPageRenderInputReaders(
    reader: ContentReader,
    repository: CmsRepository,
    loaders: RenderInputLoaders,
): void {
    const getRenderingRevision = () => readRenderingRevision(repository);
    reader.getRenderingRevision = getRenderingRevision;
    reader.getPageRenderRevision = async (path) => {
        const [route, renderingRevision] = await Promise.all([
            reader.resolveRenderableRoute(path),
            getRenderingRevision(),
        ]);
        return pageRenderRevision(route, renderingRevision);
    };
    reader.getPageRenderInputs = async (path): Promise<PageRenderInputs> => {
        const [route, renderingRevision, settings, contentTexts, renderableBlocs] = await Promise.all([
            reader.resolveRenderableRoute(path),
            getRenderingRevision(),
            loaders.getRenderingSettings(),
            loaders.getContentTexts(),
            loaders.getRenderableBlocs(),
        ]);
        return {
            route,
            artifactRevision: pageRenderRevision(route, renderingRevision),
            renderingRevision,
            settings,
            contentTexts,
            renderableBlocs,
        };
    };
}

async function readRenderingRevision(repository: CmsRepository): Promise<string> {
    const [contentRevision, systemRevision, siteBlocsRevision] = await Promise.all([
        repository.getContentContributions?.().then((contributions) => contributions.revision) ?? 0,
        repository.getSystemRevision?.() ?? 0,
        repository.getSiteBlocsRevision?.() ?? "[]",
    ]);
    return JSON.stringify([contentRevision, systemRevision, siteBlocsRevision]);
}

function pageRenderRevision(
    route: Awaited<ReturnType<ContentReader["resolveRenderableRoute"]>>,
    renderingRevision: number | string,
): string {
    return JSON.stringify([renderingRevision, renderableRouteIdentity(route)]);
}

function renderableRouteIdentity(route: Awaited<ReturnType<ContentReader["resolveRenderableRoute"]>>): unknown {
    if (!route || route.kind !== "current") {
        return route;
    }
    return {
        kind: route.kind,
        language: route.language,
        reference: route.page.reference,
        source: route.page.source,
        pageRevision: route.page.page.revision,
        path: route.page.page.path,
        visible: route.page.page.visible,
    };
}
