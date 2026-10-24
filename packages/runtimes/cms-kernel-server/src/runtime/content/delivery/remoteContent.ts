import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { GatewayContentClient } from "../GatewayContentClient";

export function remoteContent(client: GatewayContentClient): ContentReader {
    return {
        getContentTexts: async () => {
            const projection = await client.read<{
                defaultLocale: string;
                sources: { namespace: string; catalogues: Record<string, Record<string, string>> }[];
            }>("content.texts");
            return projection.sources.map((source) => ({
                namespace: source.namespace,
                resolve: (locale) => source.catalogues[locale] ?? source.catalogues[projection.defaultLocale] ?? {},
            }));
        },
        getContentRevision: () => client.read("content.revision"),
        getRenderingRevision: () => client.read("content.rendering-revision"),
        getRenderablePage: (path) => client.read("content.renderable-page", { path }),
        getRenderablePages: () => client.read("content.renderable-pages"),
        resolvePageReference: (reference) => client.read("content.resolve-page-reference", { reference }),
        resolvePagePaths: (paths) => client.read("content.resolve-page-paths", { paths }),
        resolveRenderableRoute: (path) => client.read("content.resolve-renderable-route", { path }),
        getPageRenderInputs: (path) => client.getPageRenderInputs(path),
        getPublishedPage: (path) => client.read("content.published-page", { path }),
        getPublishedPageById: (id) => client.read("content.published-page-by-id", { id }),
        getPublishedPages: () => client.read("content.published-pages"),
        resolvePublishedRoute: (path) => client.read("content.resolve-published-route", { path }),
        getRenderableBlocs: () => client.read("content.renderable-blocs"),
        getBlocViewJS: (tag) => client.readBlocView(tag),
        getRenderingSettings: () => client.read("content.rendering-settings"),
    };
}
