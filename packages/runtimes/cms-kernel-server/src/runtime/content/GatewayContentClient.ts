import type { ContentReader, RenderablePage } from "@bernouy/cms-content/rendering";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";
import type { Logger } from "@bernouy/logging";
import type { BlobRange } from "@bernouy/blob-store";

type DeliveryOperation =
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
    | "content.rendering-settings"
    | "assets.metadata"
    | "assets.metadata-batch";

export class GatewayContentClient {
    readonly content: ContentReader;
    readonly editorialPages: {
        resolveRoute(path: string): Promise<{ readonly page: RenderablePage; readonly language: string } | null>;
    };
    readonly collectionAssets: InstalledCollectionAssetSource;
    readonly #collectionByDigest = new Map<string, string>();

    constructor(
        private readonly gateway: GatewayInvoker,
        private readonly logger: Logger,
    ) {
        this.content = remoteContent(this);
        this.editorialPages = {
            resolveRoute: (path) => this.read("content.editorial-route", { path }),
        };
        this.collectionAssets = {
            siteId: "default",
            store: {
                getInstalledAssetMetadata: async (_siteId, collectionId, assetId) => {
                    const installed = await this.read<CollectionAssetMetadata | null>("assets.metadata", {
                        collectionId,
                        assetId,
                    });
                    this.rememberCollectionAssets(installed ? [installed] : []);
                    return installed;
                },
                getInstalledAssetMetadataBatch: async (_siteId, references) => {
                    const installed = await this.read<CollectionAssetMetadata[]>("assets.metadata-batch", {
                        references,
                    });
                    this.rememberCollectionAssets(installed);
                    return installed;
                },
                getReleaseAsset: (digest, assetId, range) => this.readCollectionAsset(digest, assetId, range),
            },
        };
    }

    async sitemap(request: Request): Promise<Response> {
        return this.readResource("delivery.sitemap", { path: new URL(request.url).pathname }, request);
    }

    async robots(request: Request): Promise<Response> {
        return this.readResource("delivery.robots", {}, request);
    }

    private async readResource(capabilityId: string, input: Readonly<Record<string, unknown>>, request: Request) {
        try {
            const result = await this.gateway.invoke({
                siteId: "default",
                contractId: "ulvia.cms.content",
                capabilityId,
                input,
                actor: { kind: "system", serviceId: "cms-kernel" },
            });
            if (result.kind === "declared-error") {
                return new Response(result.status === 404 ? "Not Found" : "Service Unavailable", {
                    status: result.status,
                    headers: { "cache-control": "no-store" },
                });
            }
            if (result.kind !== "binary") {
                throw new TypeError("Content resource returned a non-binary response");
            }
            return binaryResponse(result, request.method === "HEAD");
        } catch (error) {
            this.logger.error("content.delivery.resource.failed", { capabilityId }, error);
            return new Response("Service Unavailable", {
                status: 503,
                headers: { "cache-control": "no-store" },
            });
        }
    }

    async read<T>(operation: DeliveryOperation, input?: unknown): Promise<T> {
        const startedAt = performance.now();
        try {
            const result = await this.gateway.invoke({
                siteId: "default",
                contractId: "ulvia.cms.content",
                capabilityId: "delivery.read",
                input: {
                    operation,
                    ...(input === undefined ? {} : { inputJson: JSON.stringify(input) }),
                },
                actor: { kind: "system", serviceId: "cms-kernel" },
            });
            if (result.kind !== "success") {
                this.logger.warn("content.delivery.rejected", {
                    operation,
                    status: result.status,
                    durationMs: roundedDuration(performance.now() - startedAt),
                });
                throw new ContentDeliveryError(operation, result.status);
            }
            return parseDeliveryOutput<T>(result.output);
        } catch (error) {
            if (!(error instanceof ContentDeliveryError)) {
                this.logger.error(
                    "content.delivery.failed",
                    { operation, durationMs: roundedDuration(performance.now() - startedAt) },
                    error,
                );
            }
            throw error;
        }
    }

    private async readCollectionAsset(digest: string, assetId: string, range?: BlobRange): Promise<Uint8Array | null> {
        const collectionId = this.#collectionByDigest.get(digest);
        if (!collectionId) {
            throw new TypeError("Collection asset bytes require a preceding metadata resolution");
        }
        const result = await this.gateway.invoke({
            siteId: "default",
            contractId: "ulvia.cms.content",
            capabilityId: "delivery.collection-asset",
            input: {
                collectionId,
                assetId,
                expectedDigest: digest,
                ...(range ? { rangeStart: range.start, rangeEnd: range.end } : {}),
            },
            actor: { kind: "system", serviceId: "cms-kernel" },
        });
        if (result.kind === "declared-error" && result.status === 404) {
            return null;
        }
        if (result.kind !== "binary") {
            throw new TypeError("Content collection asset returned a non-binary response");
        }
        return new Uint8Array(await new Response(result.stream).arrayBuffer());
    }

    private rememberCollectionAssets(installed: readonly CollectionAssetMetadata[]): void {
        for (const item of installed) {
            this.#collectionByDigest.set(item.digest, item.collectionId);
        }
    }
}

type CollectionAssetMetadata =
    Awaited<ReturnType<InstalledCollectionAssetSource["store"]["getInstalledAssetMetadata"]>> extends infer Value
        ? Exclude<Value, null>
        : never;

class ContentDeliveryError extends Error {
    constructor(operation: string, status: number) {
        super(`Content delivery rejected ${operation} (${status})`);
        this.name = "ContentDeliveryError";
    }
}

function parseDeliveryOutput<T>(value: unknown): T {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Content delivery returned an invalid response");
    }
    const chunks = (value as Record<string, unknown>).chunks;
    if (!Array.isArray(chunks) || chunks.length > 7 || chunks.some((chunk) => typeof chunk !== "string")) {
        throw new TypeError("Content delivery returned invalid response chunks");
    }
    return JSON.parse(chunks.join("")) as T;
}

function roundedDuration(durationMs: number): number {
    return Math.round(durationMs * 100) / 100;
}

function binaryResponse(
    result: Extract<Awaited<ReturnType<GatewayInvoker["invoke"]>>, { kind: "binary" }>,
    head: boolean,
): Response {
    return new Response(head ? null : result.stream, {
        status: result.status,
        headers: {
            ...result.responseHeaders,
            "content-type": result.contentType,
            ...(result.contentLength === undefined ? {} : { "content-length": String(result.contentLength) }),
        },
    });
}

function remoteContent(client: GatewayContentClient): ContentReader {
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
        getPublishedPage: (path) => client.read("content.published-page", { path }),
        getPublishedPageById: (id) => client.read("content.published-page-by-id", { id }),
        getPublishedPages: () => client.read("content.published-pages"),
        resolvePublishedRoute: (path) => client.read("content.resolve-published-route", { path }),
        getRenderableBlocs: () => client.read("content.renderable-blocs"),
        getBlocViewJS: (tag) => client.read("content.bloc-view-js", { tag }),
        getRenderingSettings: () => client.read("content.rendering-settings"),
    };
}
