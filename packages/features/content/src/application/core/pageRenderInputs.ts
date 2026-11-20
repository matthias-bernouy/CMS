import { projectRenderingSettings } from "content/settings/core/renderingSettings";
import { RenderingResourceReads } from "./RenderingResourceReads";
import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type {
    ContentReader,
    PageRenderInputs,
    PageRenderPreparation,
    RenderableBloc,
} from "content/application/interfaces/ContentReader";
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

export class PageRenderInputsChanged extends Error {}

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
    reader.preparePageRenderInputs = async (path): Promise<PageRenderPreparation> => {
        const reads = new RenderingResourceReads();
        try {
            // Legacy adapters share their eager contribution read; revision-aware adapters defer payload projection.
            const contributions = repository.getTextContributionsRevision
                ? undefined
                : repository.getTextContributions?.(reads);
            const [resolved, contentRevision] = await Promise.all([
                loaders.routeWithSettings(path, reads),
                repository.getTextContributionsRevision?.(reads) ?? contributions?.then((value) => value.revision) ?? 0,
            ]);
            // Route requirements may already have loaded Bloc metadata in this read scope.
            const siteBlocsRevision = await (repository.getSiteBlocsRevision?.(reads) ?? "[]");
            const renderingRevision = await revisionDigest([contentRevision, resolved.settings, siteBlocsRevision]);
            const metadata = {
                route: resolved.route,
                artifactRevision: await pageRenderRevision(resolved.route, renderingRevision),
                renderingRevision,
                settings: resolved.settings,
            };
            let pending: Promise<PageRenderInputs> | undefined;
            return {
                ...metadata,
                load: () =>
                    (pending ??= Promise.all([
                        contributions ?? repository.getTextContributions?.(reads),
                        loaders.getRenderableBlocs(reads),
                    ]).then(async ([loadedContributions, renderableBlocs]) => {
                        const loadedBlocsRevision = await (repository.getSiteBlocsRevision?.(reads) ?? "[]");
                        if (
                            (loadedContributions?.revision ?? 0) !== contentRevision ||
                            loadedBlocsRevision !== siteBlocsRevision
                        ) {
                            throw new PageRenderInputsChanged("Rendering resources changed during preparation");
                        }
                        return { ...metadata, contentTexts: [...(loadedContributions?.texts ?? [])], renderableBlocs };
                    })),
                close: () => reads.close(),
            };
        } catch (error) {
            reads.close();
            throw error;
        }
    };
    reader.getPageRenderInputs = async (path): Promise<PageRenderInputs> => {
        const preparation = await reader.preparePageRenderInputs!(path);
        try {
            return await preparation.load();
        } finally {
            preparation.close();
        }
    };
}

async function readRenderingRevision(repository: ContentRepository): Promise<string> {
    const [contentRevision, settings, siteBlocsRevision] = await Promise.all([
        repository.getTextContributionsRevision?.() ??
            repository.getTextContributions?.().then((contributions) => contributions.revision) ??
            0,
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
