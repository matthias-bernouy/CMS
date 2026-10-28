import type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";
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
    repository: ContentRepository,
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
        const contributions = repository.getTextContributions?.() ?? Promise.resolve(undefined);
        const [route, loadedContributions, systemRevision, siteBlocsRevision, settings, renderableBlocs] =
            await Promise.all([
                reader.resolveRenderableRoute(path),
                contributions,
                repository.getSystemRevision?.() ?? 0,
                repository.getSiteBlocsRevision?.() ?? "[]",
                loaders.getRenderingSettings(),
                loaders.getRenderableBlocs(),
            ]);
        const renderingRevision = await revisionDigest([
            loadedContributions?.revision ?? 0,
            systemRevision,
            siteBlocsRevision,
        ]);
        return {
            route,
            artifactRevision: await pageRenderRevision(route, renderingRevision),
            renderingRevision,
            settings,
            contentTexts: [...(loadedContributions?.texts ?? [])],
            renderableBlocs,
        };
    };
}

async function readRenderingRevision(repository: ContentRepository): Promise<string> {
    const [contentRevision, systemRevision, siteBlocsRevision] = await Promise.all([
        repository.getTextContributions?.().then((contributions) => contributions.revision) ?? 0,
        repository.getSystemRevision?.() ?? 0,
        repository.getSiteBlocsRevision?.() ?? "[]",
    ]);
    return revisionDigest([contentRevision, systemRevision, siteBlocsRevision]);
}

function pageRenderRevision(
    route: Awaited<ReturnType<ContentReader["resolveRenderableRoute"]>>,
    renderingRevision: number | string,
): Promise<string> {
    return revisionDigest([renderingRevision, renderableRouteIdentity(route)]);
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

async function revisionDigest(parts: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(parts));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
