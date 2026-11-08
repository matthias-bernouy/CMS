import { ifNoneMatchMatches, ifRangeAllowsPartial, parseSingleByteRange } from "@bernouy/http-runner";
import { assetReferences } from "resources/storage/records";
import type { ResourceAssetSource } from "./references";
import { RESOURCE_ASSETS_ROUTE } from "./references";
import { resourceAssetHeaders } from "./headers";
import { resourceAssetStream } from "./stream";

/** Ordinary instance-owned files. Neither routing nor reads require an archive or installed release. */
export async function serveResourceAsset(
    request: Request,
    source: ResourceAssetSource,
    options: { readonly inlineSvg?: boolean } = {},
): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response(null, { status: 405, headers: { allow: "GET, HEAD", "cache-control": "no-store" } });
    }
    request.signal.throwIfAborted();
    const reference = parseReference(request);
    if (!reference) {
        return missing();
    }
    const entry = await source.representation({ namespace: reference.namespace, id: reference.id });
    request.signal.throwIfAborted();
    if (!entry || (reference.version !== null && reference.version !== entry.metadata.digest.slice(7))) {
        return missing();
    }
    const asset = entry.metadata;
    if (options.inlineSvg && (asset.mediaType !== "image/svg+xml" || !asset.profiles?.includes("inline-svg"))) {
        return missing();
    }
    const headers = resourceAssetHeaders(asset, reference.version !== null);
    const etag = headers.get("etag")!;
    if (ifNoneMatchMatches(request.headers.get("if-none-match"), etag)) {
        headers.delete("content-length");
        return new Response(null, { status: 304, headers });
    }
    if (request.method === "HEAD") {
        return new Response(null, { headers });
    }
    const range = ifRangeAllowsPartial(request.headers.get("if-range"), etag)
        ? parseSingleByteRange(request.headers.get("range"), asset.byteLength)
        : null;
    if (range === "unsatisfiable") {
        headers.set("content-length", "0");
        headers.set("content-range", `bytes */${asset.byteLength}`);
        return new Response(null, { status: 416, headers });
    }
    const stream = await entry.read(range ?? undefined);
    const length = range ? range.end - range.start + 1 : asset.byteLength;
    if (range) {
        headers.set("content-length", String(length));
        headers.set("content-range", `bytes ${range.start}-${range.end}/${asset.byteLength}`);
    }
    return new Response(resourceAssetStream(stream, length, request.signal), { status: range ? 206 : 200, headers });
}
function missing() {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}
function parseReference(request: Request) {
    const url = new URL(request.url);
    const prefix = RESOURCE_ASSETS_ROUTE + "/";
    if (!url.pathname.startsWith(prefix)) {
        return null;
    }
    try {
        const parts = url.pathname.slice(prefix.length).split("/");
        if (
            parts.length !== 2 ||
            [...url.searchParams.keys()].some((key) => key !== "v") ||
            url.searchParams.getAll("v").length > 1
        ) {
            return null;
        }
        const [namespace, id] = parts.map(decodeURIComponent);
        // Reuse the storage identity bounds and reject alternate URL spellings.
        const asset = assetReferences([{ namespace: namespace!, id: id! }])[0]!;
        if (parts[0] !== encodeURIComponent(asset.namespace) || parts[1] !== encodeURIComponent(asset.id)) {
            return null;
        }
        const version = url.searchParams.get("v");
        if (version !== null && !/^[0-9a-f]{64}$/u.test(version)) {
            return null;
        }
        return { namespace: asset.namespace, id: asset.id, version };
    } catch {
        return null;
    }
}
