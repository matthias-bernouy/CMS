import { parseCollectionAssetReference } from "@bernouy/content/rendering";
import { handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import type { GatewayInvocation, GatewayResult } from "@bernouy/cms-gateway";
import type { GatewayProviderClient } from "@bernouy/cms-gateway/provider/node";
import type { ContractRelease } from "@bernouy/ulvia-contracts";
import type { ResourceAssetSource } from "@bernouy/resources/delivery";
import type { Cache } from "@bernouy/http-runner";
import { resolveResourceAssetSources, serveResourceAsset, RESOURCE_ASSETS_ROUTE } from "@bernouy/resources/delivery";
import { compress, getOrGenerateEntryAsync } from "@bernouy/http-runner";
import { readImmutableSvg } from "./svgResponse";
type SvgHost = {
    cache: Cache;
    executionRevision?: number;
    assets: ResourceAssetSource;
    resolveAssets?(sources: readonly string[]): Promise<ReadonlyMap<string, string>>;
    serveLegacyAsset?(request: Request): Promise<Response>;
    client: Pick<GatewayProviderClient, "invoke">;
    release(contractId: string): Promise<ContractRelease>;
};

const activeLoads = new WeakMap<Cache, number>();
const RESOLUTION_CONCURRENCY = 8;

export async function resolveSvgSources(
    host: SvgHost,
    sources: readonly string[],
): Promise<ReadonlyMap<string, Uint8Array>> {
    if (sources.length > 512 || sources.reduce((size, value) => size + value.length, 0) > 1024 * 1024) {
        throw new RangeError("Inline SVG sources exceed their budget");
    }
    const uniqueSources = [...new Set(sources)];
    const resourceSources = uniqueSources.filter((source) => parseCollectionAssetReference(source) !== null);
    const resourceUrls = host.resolveAssets
        ? await host.resolveAssets(resourceSources)
        : await resolveResourceAssetSources(resourceSources, host.assets);
    const resolved = new Map<string, Uint8Array>();
    let cursor = 0;
    const worker = async () => {
        for (;;) {
            const source = uniqueSources[cursor++];
            if (source === undefined) {
                return;
            }
            const resourceAsset = resourceUrls.has(source);
            const url = resourceUrls.get(source) ?? source;
            resolved.set(source, await resolveSvgUrl(host, url, resourceAsset));
        }
    };
    await Promise.all(Array.from({ length: Math.min(RESOLUTION_CONCURRENCY, uniqueSources.length) }, worker));
    return resolved;
}

async function resolveSvgUrl(host: SvgHost, url: string, resourceAsset: boolean): Promise<Uint8Array> {
    // Resource URLs already pin immutable ordinary metadata. Capability reads also bind selected execution.
    const key = resourceAsset ? `inline-svg:${url}` : `inline-svg:${host.executionRevision ?? 0}:${url}`;
    const entry = await getOrGenerateEntryAsync(key, host.cache, async () => {
        const active = activeLoads.get(host.cache) ?? 0;
        if (active >= RESOLUTION_CONCURRENCY) {
            throw new Error("Inline SVG load concurrency exhausted");
        }
        activeLoads.set(host.cache, active + 1);
        try {
            return compress(await readImmutableSvg(await readSvgResponse(host, url, resourceAsset)), "image/svg+xml");
        } finally {
            const remaining = activeLoads.get(host.cache)! - 1;
            if (remaining) {
                activeLoads.set(host.cache, remaining);
            } else {
                activeLoads.delete(host.cache);
            }
        }
    });
    return entry.raw.slice();
}

async function readSvgResponse(host: SvgHost, path: string, resourceAsset: boolean): Promise<Response> {
    const request = new Request(new URL(path, "http://content.internal"), {
        method: "GET",
        headers: { accept: "image/svg+xml" },
    });
    if (resourceAsset) {
        if (new URL(request.url).pathname.startsWith(RESOURCE_ASSETS_ROUTE + "/")) {
            return serveResourceAsset(request, host.assets, { inlineSvg: true });
        }
        if (host.serveLegacyAsset) {
            return host.serveLegacyAsset(request);
        }
        throw new Error("Unknown static SVG resource source");
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
