import type { AdapterStats } from "../contracts";
import type { LoadedAsset } from "./corpus";
import { safeLabel } from "./output";

export type ImagePerformanceAdapter = {
    name: string;
    reset(): Promise<void>;
    stats(): AdapterStats;
    variant(asset: LoadedAsset, targetWidth: number): Promise<Response>;
    respond?(asset: LoadedAsset, request: Request): Promise<Response>;
};

export async function createAdapter(specifier: string): Promise<ImagePerformanceAdapter> {
    if (specifier === "original") {
        return originalAdapter();
    }
    if (!specifier.startsWith("module:")) {
        throw new Error(`Unknown image adapter: ${specifier}`);
    }
    const modulePath = specifier.slice("module:".length);
    const imported = (await import(resolveModule(modulePath))) as {
        createImagePerformanceAdapter?: () => ImagePerformanceAdapter | Promise<ImagePerformanceAdapter>;
    };
    if (typeof imported.createImagePerformanceAdapter !== "function") {
        throw new Error("Candidate module must export createImagePerformanceAdapter()");
    }
    const adapter = await imported.createImagePerformanceAdapter();
    assertAdapter(adapter);
    adapter.name = safeLabel(adapter.name);
    return adapter;
}

function originalAdapter(): ImagePerformanceAdapter {
    let upstreamReads = 0;
    return {
        name: "original",
        async reset() {
            upstreamReads = 0;
        },
        stats() {
            return { cacheHits: 0, encodes: 0, upstreamReads };
        },
        async variant(asset) {
            upstreamReads++;
            return imageResponse(asset);
        },
        async respond(asset) {
            upstreamReads++;
            return imageResponse(asset);
        },
    };
}

function imageResponse(asset: LoadedAsset): Response {
    return new Response(asset.bytes.slice(), {
        headers: {
            "cache-control": "public, max-age=3600",
            "content-type": asset.mediaType,
        },
    });
}

function resolveModule(path: string): string {
    if (path.startsWith("/") || path.startsWith("file:")) {
        return path;
    }
    return `${process.cwd()}/${path.replace(/^\\.\\//, "")}`;
}

function assertAdapter(adapter: ImagePerformanceAdapter): void {
    if (
        !adapter ||
        typeof adapter.name !== "string" ||
        typeof adapter.reset !== "function" ||
        typeof adapter.stats !== "function" ||
        typeof adapter.variant !== "function"
    ) {
        throw new Error("Invalid image performance adapter");
    }
}
