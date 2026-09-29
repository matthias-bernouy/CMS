import { PROVIDER_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-gateway/media";
import type { AdapterImplementation, AdapterStats } from "../contracts";
import type { LoadedAsset } from "./corpus";
import { safeLabel } from "./output";

export type ImagePerformanceAdapter = {
    name: string;
    implementation: AdapterImplementation;
    reset(): Promise<void>;
    dispose?(): Promise<void>;
    stats(): AdapterStats;
    variant(asset: LoadedAsset, targetWidth: number): Promise<Response>;
    respond(asset: LoadedAsset, request: Request): Promise<Response>;
    foreground(request: Request): Promise<Response>;
};

export type ImagePerformanceAdapterOptions = {
    imageUpstreamDelayMs: number;
};

const DEFAULT_OPTIONS: ImagePerformanceAdapterOptions = { imageUpstreamDelayMs: 15 };
export const RELEASE_CANDIDATE_ADAPTER = "module:quality/image-performance/benchmark/adapters/gatewayImagesAdapter.ts";

export function assertReleaseAdapterSpecifier(specifier: string): void {
    if (specifier !== "original" && specifier !== RELEASE_CANDIDATE_ADAPTER) {
        throw new Error(`Release image benchmarks require original or ${RELEASE_CANDIDATE_ADAPTER}`);
    }
}

export async function createAdapter(
    specifier: string,
    options: ImagePerformanceAdapterOptions = DEFAULT_OPTIONS,
): Promise<ImagePerformanceAdapter> {
    if (specifier === "original") {
        return originalAdapter(options);
    }
    if (!specifier.startsWith("module:")) {
        throw new Error(`Unknown image adapter: ${specifier}`);
    }
    const modulePath = specifier.slice("module:".length);
    const imported = (await import(resolveModule(modulePath))) as {
        createImagePerformanceAdapter?: (
            options: ImagePerformanceAdapterOptions,
        ) => ImagePerformanceAdapter | Promise<ImagePerformanceAdapter>;
    };
    if (typeof imported.createImagePerformanceAdapter !== "function") {
        throw new Error("Candidate module must export createImagePerformanceAdapter()");
    }
    const adapter = await imported.createImagePerformanceAdapter(options);
    try {
        assertAdapter(adapter);
    } catch (error) {
        await adapter?.dispose?.();
        throw error;
    }
    adapter.name = safeLabel(adapter.name);
    return adapter;
}

async function originalAdapter(options: ImagePerformanceAdapterOptions): Promise<ImagePerformanceAdapter> {
    let stats = { cacheHits: 0, encodes: 0, upstreamReads: 0 };
    const respond = async (asset: LoadedAsset): Promise<Response> => {
        stats.upstreamReads++;
        if (options.imageUpstreamDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, options.imageUpstreamDelayMs));
        }
        return new Response(asset.bytes.slice(), { headers: { "content-type": asset.mediaType } });
    };
    return {
        name: "original",
        implementation: {
            mode: "original",
            recipeId: PROVIDER_RESPONSIVE_WEBP_V1.id,
            encoderIdentity: "original-pass-through",
        },
        async reset() {
            stats = { cacheHits: 0, encodes: 0, upstreamReads: 0 };
        },
        stats() {
            return { ...stats };
        },
        variant(asset, _targetWidth) {
            return respond(asset);
        },
        respond(asset, _request) {
            return respond(asset);
        },
        foreground(_request) {
            return Promise.resolve(
                Response.json({
                    items: Array.from({ length: 12 }, (_, index) => ({
                        id: `offer-${index + 1}`,
                        title: `Representative offer ${index + 1}`,
                        price: 100 + index,
                        media: { id: `media-${index + 1}`, width: 1_600, height: 1_200 },
                    })),
                }),
            );
        },
    };
}

function resolveModule(path: string): string {
    if (path.startsWith("/") || path.startsWith("file:")) {
        return path;
    }
    return `${process.cwd()}/${path.replace(/^\.\//, "")}`;
}

function assertAdapter(adapter: ImagePerformanceAdapter): void {
    if (
        !adapter ||
        typeof adapter.name !== "string" ||
        !adapter.implementation ||
        typeof adapter.implementation.recipeId !== "string" ||
        typeof adapter.implementation.encoderIdentity !== "string" ||
        !["original", "provider-image"].includes(adapter.implementation.mode) ||
        typeof adapter.reset !== "function" ||
        typeof adapter.stats !== "function" ||
        typeof adapter.variant !== "function" ||
        typeof adapter.respond !== "function" ||
        typeof adapter.foreground !== "function"
    ) {
        throw new Error("Invalid image performance adapter");
    }
}
