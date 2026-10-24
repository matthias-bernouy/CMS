import type { ContentReader, PageRenderInputs, RenderablePage } from "@bernouy/cms-content/rendering";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";
import type { Logger } from "@bernouy/logging";
import type { BlobRange } from "@bernouy/blob-store";
import { BlocViewBatch } from "./delivery/BlocViewBatch";
import { PageRenderInputCache, type PageRenderInputCacheOptions } from "./delivery/PageRenderInputCache";
import { ContentDeliveryError, parseDeliveryOutput, type DeliveryOperation } from "./delivery/protocol";
import { remoteContent } from "./delivery/remoteContent";
import { binaryResponse } from "./delivery/resourceResponse";

export class GatewayContentClient {
    readonly content: ContentReader;
    readonly editorialPages: {
        resolveRoute(path: string): Promise<{ readonly page: RenderablePage; readonly language: string } | null>;
    };
    readonly collectionAssets: InstalledCollectionAssetSource;
    readonly #collectionByDigest = new Map<string, string>();
    readonly #blocViews: BlocViewBatch;
    readonly #pageRenderInputs: PageRenderInputCache;

    constructor(
        private readonly gateway: GatewayInvoker,
        private readonly logger: Logger,
        options: GatewayContentClientOptions = {},
    ) {
        const read = <T>(operation: DeliveryOperation, input?: unknown) => this.read<T>(operation, input);
        this.#blocViews = new BlocViewBatch(read);
        this.#pageRenderInputs = new PageRenderInputCache(read, options.pageRenderInputs);
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
                    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
                });
                throw new ContentDeliveryError(operation, result.status);
            }
            return parseDeliveryOutput<T>(result.output);
        } catch (error) {
            if (!(error instanceof ContentDeliveryError)) {
                this.logger.error(
                    "content.delivery.failed",
                    { operation, durationMs: Math.round((performance.now() - startedAt) * 100) / 100 },
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

    async getPageRenderInputs(path: string): Promise<PageRenderInputs> {
        return this.#pageRenderInputs.get(path);
    }

    invalidatePageRenderInputs(): void {
        this.#pageRenderInputs.invalidate();
    }

    readBlocView(tag: string): Promise<string | null> {
        return this.#blocViews.get(tag);
    }
}

export type GatewayContentClientOptions = {
    readonly pageRenderInputs?: PageRenderInputCacheOptions;
};

type CollectionAssetMetadata =
    Awaited<ReturnType<InstalledCollectionAssetSource["store"]["getInstalledAssetMetadata"]>> extends infer Value
        ? Exclude<Value, null>
        : never;
