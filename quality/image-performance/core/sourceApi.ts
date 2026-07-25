import { handleSourceRequest, InMemorySourceRepository, type SourceEndpointInterceptor } from "@bernouy/cms-sources";
import type { LoadedAsset } from "./corpus";

const SOURCE_PREFIX = "/.cms/sources/";
const SOURCE_ID = "image-performance";
const IMAGE_ENDPOINT_ID = "image";
const FOREGROUND_ENDPOINT_ID = "offers";
const UPSTREAM_ORIGIN = "https://image-performance-upstream.invalid";

const FOREGROUND_PAYLOAD = {
    items: Array.from({ length: 12 }, (_, index) => ({
        id: `offer-${index + 1}`,
        title: `Representative offer ${index + 1}`,
        price: 100 + index,
        media: {
            id: `media-${index + 1}`,
            width: 1_600,
            height: 1_200,
        },
    })),
};

export type ImagePerformanceSourceApi = {
    image(asset: LoadedAsset, request: Request): Promise<Response>;
    foreground(request: Request): Promise<Response>;
};

export async function createImagePerformanceSourceApi(options: {
    interceptEndpoint?: SourceEndpointInterceptor;
    imageUpstreamDelayMs?: number;
    onImageUpstreamRead(): void;
}): Promise<ImagePerformanceSourceApi> {
    const assets = new Map<string, LoadedAsset>();
    const repository = new InMemorySourceRepository();
    await repository.createSource({
        urn: `urn:${SOURCE_ID}`,
        endpoints: [imageEndpoint(), foregroundEndpoint()],
    });
    const deps = {
        authorizeEndpoint: () => true,
        fetchImpl: async (input: Parameters<typeof fetch>[0]) => {
            const url = new URL(input instanceof Request ? input.url : String(input));
            if (url.pathname === "/original") {
                const asset = assets.get(url.searchParams.get("asset") ?? "");
                if (!asset) {
                    return new Response("Not found", { status: 404 });
                }
                options.onImageUpstreamRead();
                await delay(options.imageUpstreamDelayMs ?? 0);
                return new Response(asset.bytes.slice(), {
                    headers: {
                        "cache-control": "public, max-age=3600",
                        "content-type": asset.mediaType,
                        etag: `"${asset.assetId}"`,
                    },
                });
            }
            if (url.pathname === "/offers") {
                return Response.json(FOREGROUND_PAYLOAD, {
                    headers: { "cache-control": "private, no-store" },
                });
            }
            return new Response("Not found", { status: 404 });
        },
        interceptEndpoint: options.interceptEndpoint,
    };

    return {
        image(asset, request) {
            assets.set(asset.assetId, asset);
            return handleSourceRequest(repository, sourceRequest(request, IMAGE_ENDPOINT_ID, asset.assetId), {
                prefix: SOURCE_PREFIX,
                deps,
            });
        },
        foreground(request) {
            return handleSourceRequest(repository, sourceRequest(request, FOREGROUND_ENDPOINT_ID), {
                prefix: SOURCE_PREFIX,
                deps,
            });
        },
    };
}

function delay(durationMs: number): Promise<void> {
    return durationMs > 0 ? new Promise((resolve) => setTimeout(resolve, durationMs)) : Promise.resolve();
}

function sourceRequest(request: Request, endpointId: string, assetId?: string): Request {
    const sourceUrl = new URL(`${SOURCE_PREFIX}${SOURCE_ID}/${endpointId}`, request.url);
    for (const [name, value] of new URL(request.url).searchParams) {
        sourceUrl.searchParams.append(name, value);
    }
    if (assetId) {
        sourceUrl.searchParams.set("asset", assetId);
    }
    return new Request(sourceUrl, { headers: request.headers, method: "GET" });
}

function imageEndpoint() {
    return {
        urn: `urn:${SOURCE_ID}:${IMAGE_ENDPOINT_ID}`,
        method: "GET" as const,
        targetUrl: `${UPSTREAM_ORIGIN}/original`,
        access: { mode: "public" as const },
        responseKind: "file" as const,
        mediaType: "image/*",
        input: {
            params: [
                {
                    name: "asset",
                    in: "query" as const,
                    required: true,
                    schema: { type: "string" as const },
                },
            ],
        },
        output: [{ status: "200" }],
    };
}

function foregroundEndpoint() {
    return {
        urn: `urn:${SOURCE_ID}:${FOREGROUND_ENDPOINT_ID}`,
        method: "GET" as const,
        targetUrl: `${UPSTREAM_ORIGIN}/offers`,
        access: { mode: "public" as const },
        responseKind: "json" as const,
        output: [
            {
                status: "200",
                body: {
                    type: "object" as const,
                    required: ["items"],
                    properties: {
                        items: {
                            type: "array" as const,
                            items: {
                                type: "object" as const,
                                required: ["id", "title", "price", "media"],
                                properties: {
                                    id: { type: "string" as const },
                                    title: { type: "string" as const },
                                    price: { type: "number" as const },
                                    media: {
                                        type: "object" as const,
                                        required: ["id", "width", "height"],
                                        properties: {
                                            id: { type: "string" as const },
                                            width: { type: "number" as const },
                                            height: { type: "number" as const },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        ],
    };
}
