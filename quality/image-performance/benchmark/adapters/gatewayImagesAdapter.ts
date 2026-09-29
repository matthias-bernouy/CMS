import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { handleGatewayFileGet, handleGatewayImageGet } from "@bernouy/cms-gateway/media/handlers";
import {
    providerByteGeneration,
    PROVIDER_RESPONSIVE_WEBP_V1,
    ProviderImageService,
    type GatewayImageTransformer,
    type ProviderImageDerivativeStore,
} from "@bernouy/cms-gateway/media";
import { LocalProviderImageStore } from "@bernouy/cms-gateway/media/local-fs";
import { SharpImageTransformer } from "@bernouy/cms-gateway/media/sharp";
import type { AdapterStats } from "../../contracts";
import type { ImagePerformanceAdapter, ImagePerformanceAdapterOptions } from "../../core/adapter";
import type { LoadedAsset } from "../../core/corpus";

const SITE_ID = "image-performance";
const CONTRACT_ID = "performance";
const CAPABILITY_ID = "image";
const MEDIA_PREFIX = "/.cms/media";
const IMAGE_PREFIX = "/.cms/image";
const ACTOR = { kind: "anonymous" } as const;
const FOREGROUND_PAYLOAD = {
    items: Array.from({ length: 12 }, (_, index) => ({
        id: `offer-${index + 1}`,
        title: `Representative offer ${index + 1}`,
        price: 100 + index,
        media: { id: `media-${index + 1}`, width: 1_600, height: 1_200 },
    })),
};

type CandidateState = {
    directory: string;
    assets: Map<string, LoadedAsset>;
    images: ProviderImageService;
    invoker: GatewayInvoker;
    stats: AdapterStats;
    encoderIdentity: string;
};

/** Exercises gateway authorization-facing routes, byte-generation keys and bounded transforms. */
export async function createImagePerformanceAdapter(
    options: ImagePerformanceAdapterOptions,
): Promise<ImagePerformanceAdapter> {
    let state = await buildState(options);
    return {
        name: "provider-responsive-webp-v1-local-fs",
        implementation: {
            mode: "provider-image",
            recipeId: PROVIDER_RESPONSIVE_WEBP_V1.id,
            encoderIdentity: state.encoderIdentity,
        },
        async reset() {
            await rm(state.directory, { recursive: true, force: true });
            state = await buildState(options);
        },
        async dispose() {
            await rm(state.directory, { recursive: true, force: true });
        },
        stats() {
            return { ...state.stats };
        },
        variant(asset, targetWidth) {
            state.assets.set(asset.assetId, asset);
            return handleGatewayImageGet(
                new Request(
                    `https://benchmark.invalid${IMAGE_PREFIX}/${CONTRACT_ID}/${CAPABILITY_ID}/${asset.assetId}/${targetWidth}.webp`,
                ),
                {
                    images: state.images,
                    siteId: SITE_ID,
                    origin: "delivery",
                    actor: ACTOR,
                    prefix: IMAGE_PREFIX,
                },
            );
        },
        respond(asset) {
            state.assets.set(asset.assetId, asset);
            return handleGatewayFileGet(
                new Request(
                    `https://benchmark.invalid${MEDIA_PREFIX}/${CONTRACT_ID}/${CAPABILITY_ID}/${asset.assetId}`,
                ),
                {
                    invoker: state.invoker,
                    siteId: SITE_ID,
                    origin: "delivery",
                    actor: ACTOR,
                    prefix: MEDIA_PREFIX,
                },
            );
        },
        foreground() {
            return Promise.resolve(Response.json(FOREGROUND_PAYLOAD));
        },
    };
}

async function buildState(options: ImagePerformanceAdapterOptions): Promise<CandidateState> {
    const directory = await mkdtemp(join(tmpdir(), "cms-provider-image-performance-"));
    try {
        const assets = new Map<string, LoadedAsset>();
        const stats: AdapterStats = { cacheHits: 0, encodes: 0, upstreamReads: 0 };
        const disk = new LocalProviderImageStore(directory);
        await disk.initialize();
        const store: ProviderImageDerivativeStore = {
            async get(key) {
                const hit = await disk.get(key);
                if (hit) {
                    stats.cacheHits++;
                }
                return hit;
            },
            put: (key, derivative) => disk.put(key, derivative),
        };
        const sharp = new SharpImageTransformer();
        const releaseDigest = await providerByteGeneration(new TextEncoder().encode("benchmark-release"));
        const transformer: GatewayImageTransformer = {
            encoderIdentity: sharp.encoderIdentity,
            inspect: (bytes, recipe) => sharp.inspect(bytes, recipe),
            transform(bytes, transform) {
                stats.encodes++;
                return sharp.transform(bytes, transform);
            },
        };
        const invoker: GatewayInvoker = {
            async invoke(invocation) {
                const fileId = (invocation.input as { fileId?: unknown } | null)?.fileId;
                const asset = typeof fileId === "string" ? assets.get(fileId) : undefined;
                if (!asset) {
                    return { kind: "declared-error", requestId: "benchmark", status: 404, errorCode: "not_found" };
                }
                stats.upstreamReads++;
                if (options.imageUpstreamDelayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, options.imageUpstreamDelayMs));
                }
                return {
                    kind: "binary",
                    requestId: "benchmark",
                    status: 200,
                    bytes: asset.bytes.slice(),
                    contentType: asset.mediaType,
                    media: {
                        siteId: SITE_ID,
                        installationId: "benchmark-installation",
                        contractId: CONTRACT_ID,
                        releaseDigest,
                        capabilityId: CAPABILITY_ID,
                        fileId,
                        generation: await providerByteGeneration(asset.bytes),
                    },
                };
            },
        };
        return {
            directory,
            assets,
            images: new ProviderImageService({ invoker, transformer, store }),
            invoker,
            stats,
            encoderIdentity: transformer.encoderIdentity,
        };
    } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
}
