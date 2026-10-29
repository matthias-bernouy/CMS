import { gzipSync } from "bun";
import type { CachedResource } from "./types";
import {
    acceptsGzip,
    acceptsIdentity,
    isCompressibleType,
    ifNoneMatchMatches,
    prepareStreamingResponse,
} from "@bernouy/http-runner";
export function gzipVariant(bytes: Uint8Array<ArrayBuffer>, type: string | null): Uint8Array<ArrayBuffer> | undefined {
    return isCompressibleType(type) ? new Uint8Array(gzipSync(bytes, { level: 1 })) : undefined;
}
export function cachedResponse(entry: CachedResource, request: Request, now: number, state: string): Response {
    const headers = new Headers([...entry.headers]);
    const gzip = Boolean(entry.gzip && acceptsGzip(request.headers.get("accept-encoding")));
    if (!gzip && !acceptsIdentity(request.headers.get("accept-encoding"))) {
        return new Response(null, { status: 406, headers: { "cache-control": "no-store" } });
    }
    const bytes = gzip ? entry.gzip! : entry.raw;
    if (gzip) {
        headers.set("content-encoding", "gzip");
        const tag = headers.get("etag");
        if (tag && !tag.startsWith("W/")) {
            headers.set("etag", `W/${tag}`);
        }
    }
    headers.set("content-length", String(bytes.byteLength));
    headers.set("vary", headers.get("vary") ?? "Accept-Encoding");
    headers.set("age", String(Math.max(0, Math.floor((now - entry.storedAt) / 1000))));
    headers.set("x-cache", state);
    const matched = ifNoneMatchMatches(
        request.headers.get("if-none-match"),
        (headers.get("etag") ?? "").replace(/^W\//u, ""),
    );
    if (matched) {
        headers.delete("content-length");
        return new Response(null, { status: 304, headers });
    }
    return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers });
}
export async function streamingResponse(response: Response, request: Request, state: string): Promise<Response> {
    const result = await prepareStreamingResponse(request, response);
    result.headers.set("x-cache", state);
    return result;
}
