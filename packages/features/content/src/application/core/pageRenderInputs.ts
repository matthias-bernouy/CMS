import { projectRenderingSettings } from "content/settings/core/renderingSettings";
import { RenderingResourceReads } from "./RenderingResourceReads";
import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type { ContentReader, PageRenderInputs, RenderableBloc } from "content/application/interfaces/ContentReader";
import type { ContentTextSource } from "content/pages/core/rendering/contentTexts";
import type { RenderingSettings } from "content/settings/interfaces/settings";

type RenderInputLoaders = {
    routeWithSettings(
        path: string,
        reads?: RenderingResourceReads,
    ): Promise<{
        route: Awaited<ReturnType<ContentReader["resolveRenderableRoute"]>>;
        settings: RenderingSettings;
    }>;
    getContentTexts(): Promise<ContentTextSource[]>;
    getRenderableBlocs(reads?: RenderingResourceReads): Promise<RenderableBloc[]>;
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
        const reads = new RenderingResourceReads();
        try {
            const contributions = repository.getTextContributions?.(reads) ?? Promise.resolve(undefined);
            const [resolved, loadedContributions, renderableBlocs] = await Promise.all([
                loaders.routeWithSettings(path, reads),
                contributions,
                loaders.getRenderableBlocs(reads),
            ]);
            const siteBlocsRevision = await (repository.getSiteBlocsRevision?.(reads) ?? "[]");
            const renderingRevision = await revisionDigest([
                loadedContributions?.revision ?? 0,
                resolved.settings,
                siteBlocsRevision,
            ]);
            return {
                route: resolved.route,
                artifactRevision: await pageRenderRevision(resolved.route, renderingRevision),
                renderingRevision,
                settings: resolved.settings,
                contentTexts: [...(loadedContributions?.texts ?? [])],
                renderableBlocs,
            };
        } finally {
            reads.close();
        }
    };
}

async function readRenderingRevision(repository: ContentRepository): Promise<string> {
    const [contentRevision, settings, siteBlocsRevision] = await Promise.all([
        repository.getTextContributions?.().then((contributions) => contributions.revision) ?? 0,
        repository.getSystem().then(projectRenderingSettings),
        repository.getSiteBlocsRevision?.() ?? "[]",
    ]);
    return revisionDigest([contentRevision, settings, siteBlocsRevision]);
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
