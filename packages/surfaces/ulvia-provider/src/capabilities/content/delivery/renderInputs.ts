import type { ContentReader, PageRenderInputs } from "@bernouy/cms-content/rendering";
import { measureCurrentRequestTiming } from "@bernouy/http-runner/observability";
import { replaceCollectionAssetExpressions } from "@bernouy/cms-repository/collections";
import type {
    CollectionStore,
    InstalledCollectionAssetMetadata,
} from "@bernouy/cms-repository/collections/installations";

export async function pageRenderRevision(path: string, content: ContentReader): Promise<number | string> {
    if (content.getPageRenderRevision) {
        return content.getPageRenderRevision(path);
    }
    return (await fallbackPageRenderInputs(path, content)).artifactRevision;
}

export async function projectPageRenderInputs(
    path: string,
    content: ContentReader,
    collections: Pick<CollectionStore, "getInstalledAssetMetadataBatch">,
): Promise<DeliveredPageRenderInputs> {
    const inputs = await measureCurrentRequestTiming("content_snapshot", () =>
        content.getPageRenderInputs ? content.getPageRenderInputs(path) : fallbackPageRenderInputs(path, content),
    );
    const blocTags = inputs.renderableBlocs.map(({ id }) => id);
    const views = await measureCurrentRequestTiming("content_bloc_views", () => blocViews(blocTags, content));
    const defaultLocale = inputs.settings.site.language || "en";
    const locales = [...new Set([defaultLocale, ...(inputs.settings.site.activeLanguages ?? [])])];
    const projected = {
        route: inputs.route,
        artifactRevision: inputs.artifactRevision,
        renderingRevision: inputs.renderingRevision,
        settings: inputs.settings,
        renderableBlocs: inputs.renderableBlocs,
        blocViews: views,
        texts: {
            defaultLocale,
            sources: inputs.contentTexts.map((source) => ({
                namespace: source.namespace,
                catalogues: Object.fromEntries(locales.map((locale) => [locale, source.resolve(locale)])),
            })),
        },
    };
    const references = collectCollectionAssetReferences(projected);
    const collectionAssets = await measureCurrentRequestTiming("content_asset_metadata", () =>
        references.length > 0 ? collections.getInstalledAssetMetadataBatch("default", references) : Promise.resolve([]),
    );
    return { ...projected, collectionAssets };
}

export async function blocViews(
    tags: readonly string[],
    content: ContentReader,
): Promise<Record<string, string | null>> {
    const uniqueTags = [...new Set(tags)];
    if (uniqueTags.length === 0) {
        return {};
    }
    if (content.getBlocViewsJS) {
        return { ...(await content.getBlocViewsJS(uniqueTags)) };
    }
    return Object.fromEntries(
        await Promise.all(uniqueTags.map(async (tag) => [tag, await content.getBlocViewJS(tag)])),
    );
}

async function fallbackPageRenderInputs(path: string, content: ContentReader): Promise<PageRenderInputs> {
    const [route, renderingRevision, settings, contentTexts, renderableBlocs] = await Promise.all([
        content.resolveRenderableRoute(path),
        content.getRenderingRevision?.() ?? content.getContentRevision?.() ?? Promise.resolve(0),
        content.getRenderingSettings(),
        content.getContentTexts?.() ?? Promise.resolve([]),
        content.getRenderableBlocs(),
    ]);
    return {
        route,
        artifactRevision: renderingRevision,
        renderingRevision,
        settings,
        contentTexts,
        renderableBlocs,
    };
}

function collectCollectionAssetReferences(value: unknown): Array<{ collectionId: string; assetId: string }> {
    const references = new Map<string, { collectionId: string; assetId: string }>();
    const pending: unknown[] = [value];
    const visited = new Set<object>();
    while (pending.length > 0) {
        const current = pending.pop();
        if (typeof current === "string") {
            replaceCollectionAssetExpressions(current, (collectionId, assetId) => {
                references.set(`${collectionId}\0${assetId}`, { collectionId, assetId });
                return undefined;
            });
        } else if (current && typeof current === "object" && !visited.has(current)) {
            visited.add(current);
            pending.push(...(Array.isArray(current) ? current : Object.values(current)));
        }
    }
    return [...references.values()];
}

export type DeliveredPageRenderInputs = Omit<PageRenderInputs, "contentTexts"> & {
    readonly blocViews: Readonly<Record<string, string | null>>;
    readonly collectionAssets: readonly InstalledCollectionAssetMetadata[];
    readonly texts: {
        readonly defaultLocale: string;
        readonly sources: readonly {
            readonly namespace: string;
            readonly catalogues: Readonly<Record<string, Readonly<Record<string, string>>>>;
        }[];
    };
};
