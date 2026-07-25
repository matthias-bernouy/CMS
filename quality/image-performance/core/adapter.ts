import { SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import type { AdapterImplementation, AdapterStats } from "../contracts";
import type { LoadedAsset } from "./corpus";
import { safeLabel } from "./output";
import { createImagePerformanceSourceApi } from "./sourceApi";

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
export const RELEASE_CANDIDATE_ADAPTER = "module:quality/image-performance/core/sourceImagesAdapter.ts";

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
    const sourceApi = await createImagePerformanceSourceApi({
        imageUpstreamDelayMs: options.imageUpstreamDelayMs,
        onImageUpstreamRead() {
            stats.upstreamReads++;
        },
    });
    return {
        name: "original",
        implementation: {
            mode: "original",
            recipeId: SOURCE_RESPONSIVE_WEBP_V1.id,
            encoderIdentity: "original-pass-through",
        },
        async reset() {
            stats = { cacheHits: 0, encodes: 0, upstreamReads: 0 };
        },
        stats() {
            return { ...stats };
        },
        variant(asset, _targetWidth) {
            return sourceApi.image(asset, new Request(`https://benchmark.invalid/image/${asset.assetId}`));
        },
        respond(asset, request) {
            return sourceApi.image(asset, request);
        },
        foreground(request) {
            return sourceApi.foreground(request);
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
        (adapter.implementation.mode !== "original" && adapter.implementation.mode !== "source-image") ||
        typeof adapter.reset !== "function" ||
        typeof adapter.stats !== "function" ||
        typeof adapter.variant !== "function" ||
        typeof adapter.respond !== "function" ||
        typeof adapter.foreground !== "function"
    ) {
        throw new Error("Invalid image performance adapter");
    }
}
