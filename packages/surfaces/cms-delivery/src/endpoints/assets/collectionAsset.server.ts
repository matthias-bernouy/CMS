import { securityHeaders } from "@bernouy/http-runner";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { COLLECTION_ASSETS_ROUTE, collectionAssetVersion } from "cms-delivery/core/assets/collectionAssets";
import { ifRangeAllowsPartial, parseByteRange } from "./byteRange";

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
        ...securityHeaders(),
        "Cache-Control": reference.version ? IMMUTABLE : REVALIDATE,
        "Accept-Ranges": "bytes",
        "Content-Disposition": inlineSafe(asset.mediaType) ? "inline" : "attachment",
        "Content-Length": String(asset.byteLength),
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Content-Type": asset.mediaType,
        ETag: etag,
    });
    if (matchesIfNoneMatch(request.headers.get("if-none-match"), etag)) {
        headers.delete("Content-Length");
        return new Response(null, { status: 304, headers });
    }
    if (request.method === "HEAD") {
        return new Response(null, { headers });
    }
    const range = ifRangeAllowsPartial(request.headers.get("if-range"), etag)
        ? parseByteRange(request.headers.get("range"), asset.byteLength)
        : null;
    if (range === "unsatisfiable") {
        headers.set("Content-Length", "0");
        headers.set("Content-Range", `bytes */${asset.byteLength}`);
        return new Response(null, { status: 416, headers });
    }
    const bytes = await source.store.getReleaseAsset(installedAsset.digest, asset.id);
    if (!bytes) {
        return new Response(null, { status: 404 });
    }
    if (range) {
        const body = bytes.slice(range.start, range.end + 1);
        headers.set("Content-Length", String(body.byteLength));
        headers.set("Content-Range", `bytes ${range.start}-${range.end}/${bytes.byteLength}`);
        return new Response(body.slice().buffer as ArrayBuffer, { status: 206, headers });
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
        if (version !== null && !/^[0-9a-f]{64}$/u.test(version)) {
            return null;
        }
        return { collectionId, assetId, version };
    } catch {
        return null;
    }
}

function inlineSafe(mediaType: string): boolean {
    return /^(?:image|audio|video|font)\//u.test(mediaType) || mediaType === "application/pdf";
}

function matchesIfNoneMatch(value: string | null, etag: string): boolean {
    return (
        value
            ?.split(",")
            .map((candidate) => candidate.trim().replace(/^W\//u, ""))
            .some((candidate) => candidate === "*" || candidate === etag) ?? false
    );
}
