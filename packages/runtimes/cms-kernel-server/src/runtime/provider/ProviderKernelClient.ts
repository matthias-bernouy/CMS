import type { ContentReader, RenderablePage } from "@bernouy/cms-content/rendering";
import type { KernelProviderQuery, KernelProviderQueryOperation } from "@bernouy/ulvia-provider/kernel";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";
import type { ProviderKernelTransport } from "./ProviderKernelTransport";
import type { Logger } from "@bernouy/logging";
import { currentRequestHeaders } from "@bernouy/http-runner/observability";

export class ProviderKernelClient {
    readonly content: ContentReader;
    readonly editorialPages: {
        resolveRoute(path: string): Promise<{ readonly page: RenderablePage; readonly language: string } | null>;
    };
    readonly collectionAssets: InstalledCollectionAssetSource;

    constructor(
        private readonly transport: ProviderKernelTransport,
        private readonly logger: Logger,
    ) {
        this.content = remoteContent(this);
        this.editorialPages = {
            resolveRoute: (path) => this.query("content.editorial-route", { path }),
        };
        this.collectionAssets = {
            siteId: "default",
            store: {
                getInstalledAssetMetadata: (_siteId, collectionId, assetId) =>
                    this.query("assets.metadata", { collectionId, assetId }),
                getInstalledAssetMetadataBatch: (_siteId, references) =>
                    this.query("assets.metadata-batch", { references }),
                getReleaseAsset: async () => {
                    throw new Error("Collection asset bytes are streamed through the Provider proxy");
                },
            },
        };
    }

    async query<T>(operation: KernelProviderQueryOperation, input?: unknown): Promise<T> {
        const startedAt = performance.now();
        try {
            const headers = currentRequestHeaders({ "content-type": "application/json" });
            const response = await this.transport.request("/ulvia/kernel/v1/query", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    operation,
                    ...(input === undefined ? {} : { input }),
                } satisfies KernelProviderQuery),
                signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) {
                this.logger.warn("provider.query.rejected", {
                    operation,
                    status: response.status,
                    durationMs: roundedDuration(performance.now() - startedAt),
                });
                throw new ProviderQueryError(response.status);
            }
            return ((await response.json()) as { value: T }).value;
        } catch (error) {
            if (!(error instanceof ProviderQueryError)) {
                this.logger.error(
                    "provider.query.failed",
                    { operation, durationMs: roundedDuration(performance.now() - startedAt) },
                    error,
                );
            }
            throw error;
        }
    }

    collectionAsset = (request: Request): Promise<Response> =>
        this.forward(
            `/ulvia/kernel/v1/collections${new URL(request.url).pathname.slice("/.cms/collections".length)}${new URL(request.url).search}`,
            request,
        );

    sitemap = (request: Request): Promise<Response> => this.forwardSitemap(request);

    private async forward(
        path: string,
        request: Request,
        extraHeaders?: HeadersInit,
        timeoutMs?: number,
    ): Promise<Response> {
        const response = await this.transport.forward(path, request, currentRequestHeaders(extraHeaders), timeoutMs);
        if (!response.ok) {
            this.logger.warn("provider.proxy.failed", {
                path: path.split("?")[0],
                status: response.status,
            });
        }
        return this.transport.response(response);
    }

    private forwardSitemap(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        return this.forward("/ulvia/kernel/v1/sitemap/resource", request, { "x-ulvia-original-path": path });
    }
}

class ProviderQueryError extends Error {
    constructor(status: number) {
        super(`Provider query failed (${status})`);
        this.name = "ProviderQueryError";
    }
}

function roundedDuration(durationMs: number): number {
    return Math.round(durationMs * 100) / 100;
}

function remoteContent(client: ProviderKernelClient): ContentReader {
    return {
        getContentTexts: async () => {
            const projection = await client.query<{
                defaultLocale: string;
                sources: { namespace: string; catalogues: Record<string, Record<string, string>> }[];
            }>("content.texts");
            return projection.sources.map((source) => ({
                namespace: source.namespace,
                resolve: (locale) => source.catalogues[locale] ?? source.catalogues[projection.defaultLocale] ?? {},
            }));
        },
        getContentRevision: () => client.query("content.revision"),
        getRenderingRevision: () => client.query("content.rendering-revision"),
        getRenderablePage: (path) => client.query("content.renderable-page", { path }),
        getRenderablePages: () => client.query("content.renderable-pages"),
        resolvePageReference: (reference) => client.query("content.resolve-page-reference", { reference }),
        resolvePagePaths: (paths) => client.query("content.resolve-page-paths", { paths }),
        resolveRenderableRoute: (path) => client.query("content.resolve-renderable-route", { path }),
        getPublishedPage: (path) => client.query("content.published-page", { path }),
        getPublishedPageById: (id) => client.query("content.published-page-by-id", { id }),
        getPublishedPages: () => client.query("content.published-pages"),
        resolvePublishedRoute: (path) => client.query("content.resolve-published-route", { path }),
        getRenderableBlocs: () => client.query("content.renderable-blocs"),
        getBlocViewJS: (tag) => client.query("content.bloc-view-js", { tag }),
        getRenderingSettings: () => client.query("content.rendering-settings"),
    };
}
