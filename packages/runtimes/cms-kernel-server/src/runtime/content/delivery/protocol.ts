import type { ContentTextSource, PageRenderInputs } from "@bernouy/cms-content/rendering";
import type { InstalledCollectionAssetMetadata } from "@bernouy/cms-repository/collections/installations";

export type DeliveryOperation =
    | "content.texts"
    | "content.revision"
    | "content.rendering-revision"
    | "content.editorial-route"
    | "content.renderable-page"
    | "content.renderable-pages"
    | "content.resolve-page-reference"
    | "content.resolve-page-paths"
    | "content.resolve-renderable-route"
    | "content.published-page"
    | "content.published-page-by-id"
    | "content.published-pages"
    | "content.resolve-published-route"
    | "content.renderable-blocs"
    | "content.bloc-view-js"
    | "content.bloc-views"
    | "content.page-render-inputs"
    | "content.page-render-revision"
    | "content.rendering-settings"
    | "assets.metadata"
    | "assets.metadata-batch";

export type DeliveryRead = <T>(operation: DeliveryOperation, input?: unknown) => Promise<T>;

export class ContentDeliveryError extends Error {
    constructor(operation: string, status: number) {
        super(`Content delivery rejected ${operation} (${status})`);
        this.name = "ContentDeliveryError";
    }
}

export function parseDeliveryOutput<T>(value: unknown): T {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Content delivery returned an invalid response");
    }
    const chunks = (value as Record<string, unknown>).chunks;
    if (!Array.isArray(chunks) || chunks.length > 7 || chunks.some((chunk) => typeof chunk !== "string")) {
        throw new TypeError("Content delivery returned invalid response chunks");
    }
    return JSON.parse(chunks.join("")) as T;
}

export type DeliveredPageRenderInputs = PageRenderInputs & {
    readonly blocViews: Readonly<Record<string, string | null>>;
    readonly collectionAssets: readonly InstalledCollectionAssetMetadata[];
};

export function decodePageRenderInputs(value: unknown): DeliveredPageRenderInputs {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Content delivery returned invalid Page render inputs");
    }
    const input = value as Record<string, unknown>;
    const texts = input.texts as
        | { defaultLocale?: unknown; sources?: Array<{ namespace?: unknown; catalogues?: unknown }> }
        | undefined;
    if (typeof texts?.defaultLocale !== "string" || !Array.isArray(texts.sources)) {
        throw new TypeError("Content delivery returned invalid Page render texts");
    }
    if (
        !isRevision(input.artifactRevision) ||
        !isRevision(input.renderingRevision) ||
        !input.settings ||
        typeof input.settings !== "object" ||
        !Array.isArray(input.renderableBlocs) ||
        !input.blocViews ||
        typeof input.blocViews !== "object" ||
        Array.isArray(input.blocViews) ||
        !Array.isArray(input.collectionAssets)
    ) {
        throw new TypeError("Content delivery returned invalid Page render metadata");
    }
    const contentTexts: ContentTextSource[] = texts.sources.map((source) => {
        if (typeof source.namespace !== "string" || !source.catalogues || typeof source.catalogues !== "object") {
            throw new TypeError("Content delivery returned an invalid Page text source");
        }
        const catalogues = source.catalogues as Record<string, Record<string, string>>;
        return {
            namespace: source.namespace,
            resolve: (locale) => catalogues[locale] ?? catalogues[texts.defaultLocale as string] ?? {},
        };
    });
    return {
        route: input.route as PageRenderInputs["route"],
        artifactRevision: input.artifactRevision,
        renderingRevision: input.renderingRevision,
        settings: input.settings as PageRenderInputs["settings"],
        renderableBlocs: input.renderableBlocs as PageRenderInputs["renderableBlocs"],
        blocViews: input.blocViews as Readonly<Record<string, string | null>>,
        collectionAssets: input.collectionAssets as readonly InstalledCollectionAssetMetadata[],
        contentTexts,
    };
}

function isRevision(value: unknown): value is number | string {
    return (
        (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
        (typeof value === "string" && value.length > 0 && value.length <= 4096)
    );
}
