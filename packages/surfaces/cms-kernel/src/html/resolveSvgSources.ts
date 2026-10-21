import { parseCollectionAssetReference } from "@bernouy/cms-content/rendering";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
import { resolveInstalledCollectionAssetSources } from "@bernouy/cms-repository/collections/assets";
import { serveInstalledCollectionAsset } from "@bernouy/cms-repository/collections/http";
import { compress, getOrGenerateEntryAsync } from "@bernouy/http-runner";
import type KernelCms from "cms-kernel/KernelCms";
import { resolveRequestActor } from "cms-kernel/http/pages/access/resolveRequestActor";

const MAX_INLINE_SVG_BYTES = 64 * 1024;
const RESOLUTION_CONCURRENCY = 8;

export async function resolveSvgSources(
    kernel: KernelCms,
    sources: readonly string[],
): Promise<ReadonlyMap<string, Uint8Array>> {
    const uniqueSources = [...new Set(sources)];
    const collectionSources = uniqueSources.filter((source) => parseCollectionAssetReference(source) !== null);
    const collectionUrls = await resolveInstalledCollectionAssetSources(
        collectionSources,
        kernel.collectionAssets,
        kernel.basePath,
    );
    const resolved = new Map<string, Uint8Array>();
    let cursor = 0;
    const worker = async () => {
        for (;;) {
            const source = uniqueSources[cursor++];
            if (source === undefined) {
                return;
            }
            const collectionAsset = collectionUrls.has(source);
            const url = collectionUrls.get(source) ?? source;
            resolved.set(source, await resolveSvgUrl(kernel, url, collectionAsset));
        }
    };
    await Promise.all(Array.from({ length: Math.min(RESOLUTION_CONCURRENCY, uniqueSources.length) }, worker));
    return resolved;
}

async function resolveSvgUrl(kernel: KernelCms, url: string, collectionAsset: boolean): Promise<Uint8Array> {
    const entry = await getOrGenerateEntryAsync(`inline-svg:${url}`, kernel.cache, async () => {
        const response = await readSvgResponse(kernel, url, collectionAsset);
        assertImmutableSvgResponse(response);
        const bytes = await readBounded(response);
        return compress(bytes, "image/svg+xml");
    });
    return entry.raw.slice();
}

async function readSvgResponse(kernel: KernelCms, path: string, collectionAsset: boolean): Promise<Response> {
    const request = new Request(new URL(path, "http://kernel.internal"), {
        method: "GET",
        headers: { accept: "image/svg+xml" },
    });
    if (collectionAsset) {
        if (kernel.collectionAssetHandler) {
            return kernel.collectionAssetHandler(request);
        }
        if (!kernel.collectionAssets) {
            throw new Error("Collection asset serving is not configured");
        }
        return serveInstalledCollectionAsset(request, kernel.collectionAssets, kernel.basePath);
    }
    const handler =
        kernel.capabilityHandler ??
        (kernel.capabilityGateway
            ? createCapabilityHttpHandler({
                  ...kernel.capabilityGateway,
                  basePath: kernel.basePath,
                  resolveActor: (incoming) => resolveRequestActor(kernel, incoming),
              })
            : null);
    if (!handler) {
        throw new Error("Capability serving is not configured");
    }
    return handler(request);
}

function assertImmutableSvgResponse(response: Response): void {
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const etag = response.headers.get("etag");
    const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
    if (response.status !== 200 || mediaType !== "image/svg+xml") {
        throw new Error(`cms-svg source returned ${response.status} ${mediaType ?? "without a content type"}`);
    }
    if (!etag || etag.startsWith("W/") || !cacheControl.includes("immutable")) {
        throw new Error("cms-svg source must return a strong ETag and immutable cache policy");
    }
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_INLINE_SVG_BYTES)) {
        throw new Error("cms-svg source exceeds its byte budget");
    }
}

async function readBounded(response: Response): Promise<Uint8Array> {
    if (!response.body) {
        return new Uint8Array();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        length += value.byteLength;
        if (length > MAX_INLINE_SVG_BYTES) {
            await reader.cancel();
            throw new Error("cms-svg source exceeds its byte budget");
        }
        chunks.push(value);
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}
