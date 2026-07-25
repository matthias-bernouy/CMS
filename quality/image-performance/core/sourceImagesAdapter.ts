import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createSourceImageInterceptor,
    SOURCE_RESPONSIVE_WEBP_V1,
    SourceImageSemaphore,
    type SourceImageObservation,
    type SourceImageTransformer,
} from "@bernouy/cms-source-images";
import { LocalSourceImageCache } from "@bernouy/cms-source-images/local-fs";
import { SharpSourceImageTransformer } from "@bernouy/cms-source-images/sharp";
import type { AdapterStats } from "../contracts";
import type { ImagePerformanceAdapter, ImagePerformanceAdapterOptions } from "./adapter";
import { createImagePerformanceSourceApi, type ImagePerformanceSourceApi } from "./sourceApi";

type CandidateState = {
    cache: LocalSourceImageCache;
    cacheDirectory: string;
    sourceApi: ImagePerformanceSourceApi;
    stats: AdapterStats;
    encoderIdentity: string;
};

export async function createImagePerformanceAdapter(
    options: ImagePerformanceAdapterOptions,
): Promise<ImagePerformanceAdapter> {
    let state = await buildState(options);
    return {
        name: "source-responsive-webp-v1-local-fs",
        implementation: {
            mode: "source-image",
            recipeId: SOURCE_RESPONSIVE_WEBP_V1.id,
            encoderIdentity: state.encoderIdentity,
        },
        async reset() {
            await disposeState(state);
            state = await buildState(options);
        },
        async dispose() {
            await disposeState(state);
        },
        stats() {
            return { ...state.stats };
        },
        variant(asset, targetWidth) {
            const request = new Request(`https://benchmark.invalid/image/${asset.assetId}?cms-width=${targetWidth}`);
            return state.sourceApi.image(asset, request);
        },
        respond(asset, request) {
            return state.sourceApi.image(asset, request);
        },
        foreground(request) {
            return state.sourceApi.foreground(request);
        },
    };
}

async function buildState(options: ImagePerformanceAdapterOptions): Promise<CandidateState> {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "cms-source-image-performance-"));
    try {
        const cache = new LocalSourceImageCache({
            directory: cacheDirectory,
            maxBytes: 512 * 1024 * 1024,
            maxEntries: 10_000,
            maxLookupEntries: 10_000,
        });
        await cache.initialize();
        const stats = emptyStats();
        const transformer = countingTransformer(new SharpSourceImageTransformer(), stats);
        const interceptEndpoint = createSourceImageInterceptor({
            scope: "image-performance",
            cache,
            transformer,
            semaphore: new SourceImageSemaphore(1),
            semaphoreWaitTimeoutMs: 5_000,
            observe(observation: SourceImageObservation) {
                if (observation.outcome === "cache_hit") {
                    stats.cacheHits++;
                }
            },
        });
        const sourceApi = await createImagePerformanceSourceApi({
            interceptEndpoint,
            imageUpstreamDelayMs: options.imageUpstreamDelayMs,
            onImageUpstreamRead() {
                stats.upstreamReads++;
            },
        });
        return { cache, cacheDirectory, sourceApi, stats, encoderIdentity: transformer.encoderIdentity };
    } catch (error) {
        await rm(cacheDirectory, { recursive: true, force: true });
        throw error;
    }
}

async function disposeState(state: CandidateState): Promise<void> {
    try {
        await state.cache.dispose();
    } finally {
        await rm(state.cacheDirectory, { recursive: true, force: true });
    }
}

function emptyStats(): AdapterStats {
    return { cacheHits: 0, encodes: 0, upstreamReads: 0 };
}

function countingTransformer(transformer: SourceImageTransformer, stats: AdapterStats): SourceImageTransformer {
    return {
        encoderIdentity: transformer.encoderIdentity,
        inspect(source, recipe) {
            return transformer.inspect(source, recipe);
        },
        transform(source, options) {
            stats.encodes++;
            return transformer.transform(source, options);
        },
    };
}
