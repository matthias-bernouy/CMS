import { ifNoneMatchMatches, ifRangeAllowsPartial, parseSingleByteRange, securityHeaders } from "@bernouy/http-runner";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { COLLECTION_ASSETS_ROUTE, collectionAssetVersion } from "cms-delivery/core/assets/collectionAssets";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, no-cache";

export default async function CollectionAssetServer(request: Request, delivery: DeliveryCms): Promise<Response> {
    const reference = parseReference(request, delivery);
    const source = delivery.collectionAssets;
    if (!reference || !source) {
        return new Response(null, { status: 404 });
    }
    const installedAsset = await source.store.getInstalledAssetMetadata(
        source.siteId,
        reference.collectionId,
        reference.assetId,
    );
    if (!installedAsset) {
        return new Response(null, { status: 404 });
    }
    const { asset } = installedAsset;
    const expectedVersion = await collectionAssetVersion(asset);
    if (reference.version !== null && reference.version !== expectedVersion) {
        return new Response(null, { status: 404 });
    }
    const etag = `"${expectedVersion}"`;
    const headers = new Headers({
        ...securityHeaders({ crossOriginResourcePolicy: "cross-origin" }),
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": reference.version ? IMMUTABLE : REVALIDATE,
        "Accept-Ranges": "bytes",
        "Content-Disposition": inlineSafe(asset.mediaType) ? "inline" : "attachment",
        "Content-Length": String(asset.byteLength),
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Content-Type": asset.mediaType,
        ETag: etag,
    });
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
    const bytes = await source.store.getReleaseAsset(installedAsset.digest, asset.id, range ?? undefined);
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

function parseReference(
    request: Request,
    delivery: DeliveryCms,
): { collectionId: string; assetId: string; version: string | null } | null {
    const prefix = `${delivery.basePath}${COLLECTION_ASSETS_ROUTE}/`;
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix)) {
        return null;
    }
    try {
        const [collectionId, segment, assetId, ...extra] = url.pathname
            .slice(prefix.length)
            .split("/")
            .map(decodeURIComponent);
        if (
            segment !== "assets" ||
            extra.length > 0 ||
            !collectionId ||
            !/^[a-z][a-z0-9-]{0,95}$/u.test(collectionId) ||
            !assetId ||
            !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(assetId)
        ) {
            return null;
        }
        const version = url.searchParams.get("v");
        if (version !== null && (version.length > 640 || !/^[a-z0-9-]+$/u.test(version))) {
            return null;
        }
        return { collectionId, assetId, version };
    } catch {
        return null;
    }
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

function inlineSafe(mediaType: string): boolean {
    return INLINE_SAFE_TYPES.has(mediaType);
}
