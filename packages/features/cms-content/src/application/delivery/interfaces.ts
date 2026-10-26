import type { ContentReader, PageRenderInputs, RenderablePage } from "../interfaces/ContentReader";
import type { PageReference } from "cms-content/pages/interfaces/routing";

export type DeliveredCollectionAsset = {
    collectionId: string;
    digest: string;
    asset: {
        id: string;
        mediaType: string;
        byteLength: number;
        digest: `sha256:${string}`;
        profiles?: readonly "inline-svg"[];
        deprecation?: { reason: string; replacedBy?: string; sunsetAt?: string };
    };
};
type DeliveredTexts = {
    defaultLocale: string;
    sources: { namespace: string; catalogues: Record<string, Record<string, string>> }[];
};
export type DeliveredPageRenderInputs = Omit<PageRenderInputs, "contentTexts"> & {
    texts: DeliveredTexts;
    blocViews: Readonly<Record<string, string | null>>;
    collectionAssets: readonly DeliveredCollectionAsset[];
};
export interface DeliveryResults {
    "content.texts": DeliveredTexts;
    "content.revision": number | string;
    "content.rendering-revision": number | string;
    "content.editorial-route": { page: RenderablePage; language: string } | null;
    "content.renderable-page": Awaited<ReturnType<ContentReader["getRenderablePage"]>>;
    "content.renderable-pages": Awaited<ReturnType<ContentReader["getRenderablePages"]>>;
    "content.resolve-page-reference": string | null;
    "content.resolve-page-paths": Readonly<Record<string, string>>;
    "content.resolve-renderable-route": Awaited<ReturnType<ContentReader["resolveRenderableRoute"]>>;
    "content.published-page": Awaited<ReturnType<ContentReader["getPublishedPage"]>>;
    "content.published-page-by-id": Awaited<ReturnType<ContentReader["getPublishedPageById"]>>;
    "content.published-pages": Awaited<ReturnType<ContentReader["getPublishedPages"]>>;
    "content.resolve-published-route": Awaited<ReturnType<ContentReader["resolvePublishedRoute"]>>;
    "content.renderable-blocs": Awaited<ReturnType<ContentReader["getRenderableBlocs"]>>;
    "content.bloc-view-js": string | null;
    "content.bloc-views": Readonly<Record<string, string | null>>;
    "content.page-render-inputs": DeliveredPageRenderInputs;
    "content.page-render-revision": number | string;
    "content.rendering-settings": Awaited<ReturnType<ContentReader["getRenderingSettings"]>>;
    "assets.metadata": DeliveredCollectionAsset | null;
    "assets.metadata-batch": DeliveredCollectionAsset[];
}
export type DeliveryOperation = keyof DeliveryResults;
export interface DeliveryInputs {
    "content.texts": Record<string, never>;
    "content.revision": Record<string, never>;
    "content.rendering-revision": Record<string, never>;
    "content.editorial-route": { path: string };
    "content.renderable-page": { path: string };
    "content.renderable-pages": Record<string, never>;
    "content.resolve-page-reference": { reference: PageReference };
    "content.resolve-page-paths": { paths: readonly string[] };
    "content.resolve-renderable-route": { path: string };
    "content.published-page": { path: string };
    "content.published-page-by-id": { id: string };
    "content.published-pages": Record<string, never>;
    "content.resolve-published-route": { path: string };
    "content.renderable-blocs": Record<string, never>;
    "content.bloc-view-js": { tag: string };
    "content.bloc-views": { tags: readonly string[] };
    "content.page-render-inputs": { path: string };
    "content.page-render-revision": { path: string };
    "content.rendering-settings": Record<string, never>;
    "assets.metadata": { collectionId: string; assetId: string };
    "assets.metadata-batch": { references: readonly { collectionId: string; assetId: string }[] };
}
export type DeliveryRead = <K extends DeliveryOperation>(
    operation: K,
    input?: DeliveryInputs[K],
) => Promise<DeliveryResults[K]>;
