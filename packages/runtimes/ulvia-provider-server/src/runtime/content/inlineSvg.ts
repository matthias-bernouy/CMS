import { parseCollectionAssetReference } from "@bernouy/cms-content/rendering";
import { handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import type { GatewayInvocation, GatewayResult } from "@bernouy/cms-gateway";
import type { GatewayProviderClient } from "@bernouy/cms-gateway/provider/node";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";
import type { Cache } from "@bernouy/http-runner";
import { resolveInstalledCollectionAssetSources } from "@bernouy/cms-repository/collections/assets";
import { serveInstalledCollectionAsset } from "@bernouy/cms-repository/collections/http";
import { compress, getOrGenerateEntryAsync } from "@bernouy/http-runner";
type SvgHost = {
    cache: Cache;
    assets: InstalledCollectionAssetSource;
    client: Pick<GatewayProviderClient, "invoke">;
    release(contractId: string): Promise<ContractRelease>;
};

const MAX_INLINE_SVG_BYTES = 64 * 1024;
const RESOLUTION_CONCURRENCY = 8;

export async function resolveSvgSources(
    host: SvgHost,
    sources: readonly string[],
): Promise<ReadonlyMap<string, Uint8Array>> {
    const uniqueSources = [...new Set(sources)];
    const collectionSources = uniqueSources.filter((source) => parseCollectionAssetReference(source) !== null);
    const collectionUrls = await resolveInstalledCollectionAssetSources(collectionSources, host.assets, "");
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
            resolved.set(source, await resolveSvgUrl(host, url, collectionAsset));
        }
    };
    await Promise.all(Array.from({ length: Math.min(RESOLUTION_CONCURRENCY, uniqueSources.length) }, worker));
    return resolved;
}

async function resolveSvgUrl(host: SvgHost, url: string, collectionAsset: boolean): Promise<Uint8Array> {
    const entry = await getOrGenerateEntryAsync(`inline-svg:${url}`, host.cache, async () => {
        const response = await readSvgResponse(host, url, collectionAsset);
        assertImmutableSvgResponse(response);
        const bytes = await readBounded(response);
        return compress(bytes, "image/svg+xml");
    });
    return entry.raw.slice();
}

async function readSvgResponse(host: SvgHost, path: string, collectionAsset: boolean): Promise<Response> {
    const request = new Request(new URL(path, "http://content.internal"), {
        method: "GET",
        headers: { accept: "image/svg+xml" },
    });
    if (collectionAsset) {
        return serveInstalledCollectionAsset(request, host.assets, "");
    }
    return handleGatewayHttpCall(request, {
        siteId: "default",
        prefix: "/.cms/call",
        actor: { kind: "anonymous" },
        invoker: {
            resolveContract: async ({ contractId }) => admitContractRelease(await host.release(contractId)),
            invoke: async (invocation: GatewayInvocation): Promise<GatewayResult> => {
                const release = await host.release(invocation.contractId);
                const capability = release.capabilities.find((item) => item.id === invocation.capabilityId);
                if (
                    capability?.access !== "public" ||
                    capability.behavior.effect !== "query" ||
                    capability.output.type !== "binary"
                ) {
                    throw new Error("SVG sources must be public binary queries");
                }
                const result = await host.client.invoke(release, capability.id, invocation.input, {
                    authority: "provider",
                    bindingId: invocation.bindingId,
                });
                if (!result.stream) {
                    throw new Error("SVG source returned no stream");
                }
                return {
                    ...result,
                    requestId: crypto.randomUUID(),
                    kind: "binary",
                    stream: result.stream,
                    contentType: result.contentType ?? "application/octet-stream",
                };
            },
        },
    });
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
