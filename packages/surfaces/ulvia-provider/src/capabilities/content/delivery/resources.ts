import type { ContentReader } from "@bernouy/cms-content/rendering";
import { createSitemapChunkHandler, createSitemapHandler } from "@bernouy/cms-content/seo/http";
import { NOOP_LOGGER } from "@bernouy/logging";
import {
    ProviderCapabilityDispatchError,
    type ProviderBinaryResult,
    type ProviderCapabilityRegistry,
} from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";

export function registerContentResourceCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
    content: ContentReader,
): void {
    dispatcher.register("ulvia.cms.content", "delivery.collection-asset", (input) =>
        readCollectionAsset(input, dependencies),
    );
    const logger = dependencies.logger ?? NOOP_LOGGER;
    const sitemap = createSitemapHandler({
        content,
        store: dependencies.sitemapStore,
        isReservedPath,
        logger,
    });
    const sitemapChunk = createSitemapChunkHandler({ store: dependencies.sitemapStore, basePath: "", logger });
    dispatcher.register("ulvia.cms.content", "delivery.sitemap", async (input) => {
        const path = requiredText(input.path);
        const request = new Request(`http://content.local${path}`);
        return responseResource(path === "/sitemap.xml" ? await sitemap(request) : await sitemapChunk(request));
    });
}

async function readCollectionAsset(
    input: Readonly<Record<string, unknown>>,
    dependencies: CmsContentDependencies,
): Promise<ProviderBinaryResult> {
    const collectionId = requiredText(input.collectionId);
    const assetId = requiredText(input.assetId);
    const expectedDigest = requiredText(input.expectedDigest);
    const installed = await dependencies.collections.getInstalledAssetMetadata("default", collectionId, assetId);
    if (!installed || installed.digest !== expectedDigest) {
        throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
    }
    const range = optionalRange(input.rangeStart, input.rangeEnd);
    if (range && range.end >= installed.asset.byteLength) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    const bytes = await dependencies.collections.getReleaseAsset(installed.digest, installed.asset.id, range);
    if (!bytes) {
        throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
    }
    return {
        kind: "binary",
        stream: new Response(bytes.slice().buffer as ArrayBuffer).body!,
        contentType: installed.asset.mediaType,
        contentLength: bytes.byteLength,
    };
}

function responseResource(response: Response): ProviderBinaryResult {
    if (response.status === 404) {
        throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
    }
    if (!response.ok || !response.body) {
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType) {
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    const contentLength = optionalContentLength(response.headers.get("content-length"));
    return {
        kind: "binary",
        stream: response.body,
        contentType,
        ...(contentLength === undefined ? {} : { contentLength }),
        headers: projectHeaders(response.headers),
    };
}

function optionalRange(start: unknown, end: unknown): { start: number; end: number } | undefined {
    if (start === undefined && end === undefined) {
        return undefined;
    }
    if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        Number(start) < 0 ||
        Number(end) < Number(start)
    ) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return { start: Number(start), end: Number(end) };
}

function optionalContentLength(value: string | null): number | undefined {
    if (value === null) {
        return undefined;
    }
    const length = Number(value);
    return Number.isSafeInteger(length) && length >= 0 ? length : undefined;
}

function projectHeaders(headers: Headers): Record<string, string> {
    return Object.fromEntries(
        ["cache-control", "etag", "last-modified"]
            .map((name) => [name, headers.get(name)] as const)
            .filter((entry): entry is readonly [string, string] => entry[1] !== null),
    );
}

function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value || value.length > 2048) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function isReservedPath(path: string): boolean {
    return path === "/.cms" || path.startsWith("/.cms/");
}
