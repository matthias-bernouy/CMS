import { ifNoneMatchMatches, ifRangeAllowsPartial, parseSingleByteRange, securityHeaders } from "@bernouy/http-runner";
export { collectionAssetRepresentationVersion } from "cms-repository/collections/core/admission/assets";
import { collectionAssetRepresentationVersion } from "cms-repository/collections/core/admission/assets";
import { replaceCollectionAssetExpressions } from "cms-repository/collections/core/texts/expressions";
import type { CollectionStore } from "cms-repository/collections/installations/core/CollectionStore";

export const COLLECTION_ASSETS_ROUTE = "/.cms/collections";

export type InstalledCollectionAssetSource = {
    siteId: string;
    store: Pick<CollectionStore, "getInstalledAssetMetadata" | "getInstalledAssetMetadataBatch" | "getReleaseAsset">;
};

export async function resolveInstalledCollectionAssets(
    input: string,
    source: InstalledCollectionAssetSource | undefined,
    basePath: string,
): Promise<string> {
    const references = new Set<string>();
    replaceCollectionAssetExpressions(input, (collectionId, assetId) => {
        references.add(referenceKey(collectionId, assetId));
        return "";
    });
    if (references.size === 0) {
        return input;
    }
    if (!source) {
        throw new Error("Collection asset serving is not configured");
    }
    const installed = await source.store.getInstalledAssetMetadataBatch(
        source.siteId,
        [...references].map((key) => {
            const [collectionId, assetId] = splitReferenceKey(key);
            return { collectionId, assetId };
        }),
    );
    const urls = new Map<string, string>();
    await Promise.all(
        installed.map(async ({ collectionId, asset }) => {
            const version = await collectionAssetRepresentationVersion(asset);
            urls.set(
                referenceKey(collectionId, asset.id),
                `${basePath}${COLLECTION_ASSETS_ROUTE}/${encodeURIComponent(collectionId)}/assets/${encodeURIComponent(asset.id)}?v=${version}`,
            );
        }),
    );
    return replaceCollectionAssetExpressions(input, (collectionId, assetId) => {
        const url = urls.get(referenceKey(collectionId, assetId));
        if (!url) {
            throw new Error(`Unknown installed collection asset: ${collectionId}.${assetId}`);
        }
        return url;
    });
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, no-cache";

export async function serveInstalledCollectionAsset(
    request: Request,
    source: InstalledCollectionAssetSource,
    basePath: string,
): Promise<Response> {
    const reference = parseReference(request, basePath);
    if (!reference) {
        return new Response(null, { status: 404 });
    }
    const installed = await source.store.getInstalledAssetMetadata(
        source.siteId,
        reference.collectionId,
        reference.assetId,
    );
    if (!installed) {
        return new Response(null, { status: 404 });
    }
    const { asset } = installed;
    const expectedVersion = await collectionAssetRepresentationVersion(asset);
    if (reference.version !== null && reference.version !== expectedVersion) {
        return new Response(null, { status: 404 });
    }
    const etag = `"${expectedVersion}"`;
    const headers = assetHeaders(asset.mediaType, asset.byteLength, etag, !!reference.version);
    if (ifNoneMatchMatches(request.headers.get("if-none-match"), etag)) {
        headers.delete("Content-Length");
        return new Response(null, { status: 304, headers });
    }
    if (request.method === "HEAD") {
        return new Response(null, { headers });
    }
    const range = ifRangeAllowsPartial(request.headers.get("if-range"), etag)
        ? parseSingleByteRange(request.headers.get("range"), asset.byteLength)
        : null;
    if (range === "unsatisfiable") {
        headers.set("Content-Length", "0");
        headers.set("Content-Range", `bytes */${asset.byteLength}`);
        return new Response(null, { status: 416, headers });
    }
    const bytes = await source.store.getReleaseAsset(installed.digest, asset.id, range ?? undefined);
    if (!bytes) {
        return new Response(null, { status: 404 });
    }
    if (range) {
        headers.set("Content-Length", String(bytes.byteLength));
        headers.set("Content-Range", `bytes ${range.start}-${range.end}/${asset.byteLength}`);
        return new Response(bytes.slice().buffer as ArrayBuffer, { status: 206, headers });
    }
    return new Response(bytes.slice().buffer as ArrayBuffer, { headers });
}

function assetHeaders(mediaType: string, byteLength: number, etag: string, immutable: boolean): Headers {
    return new Headers({
        ...securityHeaders({ crossOriginResourcePolicy: "cross-origin" }),
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": immutable ? IMMUTABLE : REVALIDATE,
        "Accept-Ranges": "bytes",
        "Content-Disposition": INLINE_SAFE_TYPES.has(mediaType) ? "inline" : "attachment",
        "Content-Length": String(byteLength),
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Content-Type": mediaType,
        ETag: etag,
    });
}

function parseReference(request: Request, basePath: string) {
    const prefix = `${basePath}${COLLECTION_ASSETS_ROUTE}/`;
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix)) {
        return null;
    }
    try {
        const [collectionId, segment, assetId, ...extra] = url.pathname
            .slice(prefix.length)
            .split("/")
            .map(decodeURIComponent);
        const valid = /^[a-z][a-z0-9-]{0,95}$/u.test(collectionId ?? "");
        const validAsset = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(assetId ?? "");
        if (segment !== "assets" || extra.length > 0 || !valid || !validAsset) {
            return null;
        }
        const version = url.searchParams.get("v");
        if (version !== null && (version.length > 640 || !/^[a-z0-9-]+$/u.test(version))) {
            return null;
        }
        return { collectionId: collectionId!, assetId: assetId!, version };
    } catch {
        return null;
    }
}

function referenceKey(collectionId: string, assetId: string): string {
    return `${collectionId}\0${assetId}`;
}

function splitReferenceKey(key: string): [string, string] {
    const offset = key.indexOf("\0");
    return [key.slice(0, offset), key.slice(offset + 1)];
}

const INLINE_SAFE_TYPES = new Set([
    "application/pdf",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "font/otf",
    "font/ttf",
    "font/woff",
    "font/woff2",
    "image/avif",
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/vnd.microsoft.icon",
    "image/webp",
    "image/x-icon",
    "video/mp4",
    "video/webm",
]);
