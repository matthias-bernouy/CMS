import { gzipSync } from "bun";
import type { CachedResource } from "./types";
function compressible(type: string | null): boolean {
    return Boolean(type && /^(?:text\/|application\/(?:javascript|json|xml)|image\/svg\+xml)/i.test(type));
}
export function gzipVariant(bytes: Uint8Array<ArrayBuffer>, type: string | null): Uint8Array<ArrayBuffer> | undefined {
    return compressible(type) ? new Uint8Array(gzipSync(bytes, { level: 1 })) : undefined;
}
function quality(header: string, coding: string): number | undefined {
    for (const token of header.toLowerCase().split(",")) {
        const [name, ...parameters] = token.trim().split(";");
        if (name !== coding) {
            continue;
        }
        const parameter = parameters.find((part) => part.trim().startsWith("q="));
        const value = parameter ? Number(parameter.trim().slice(2)) : 1;
        return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
    }
    return undefined;
}
function selectsGzip(request: Request): boolean {
    const header = request.headers.get("accept-encoding") ?? "";
    return (quality(header, "gzip") ?? quality(header, "*") ?? 0) > 0;
}
export function cachedResponse(entry: CachedResource, request: Request, now: number, state: string): Response {
    const headers = new Headers([...entry.headers]);
    const gzip = Boolean(entry.gzip && selectsGzip(request));
    const encoding = request.headers.get("accept-encoding") ?? "";
    if (!gzip && (quality(encoding, "identity") ?? 1) === 0) {
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
    const condition = request.headers.get("if-none-match");
    const tag = headers.get("etag")?.replace(/^W\//, "");
    const matched = condition
        ?.split(",")
        .some((part) => part.trim() === "*" || (tag && part.trim().replace(/^W\//, "") === tag));
    if (matched) {
        headers.delete("content-length");
        return new Response(null, { status: 304, headers });
    }
    return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers });
}
export function streamingResponse(response: Response, request: Request, state: string): Response {
    const headers = new Headers(response.headers);
    headers.set("x-cache", state);
    let body = response.body;
    if (
        body &&
        request.method !== "HEAD" &&
        response.status === 200 &&
        selectsGzip(request) &&
        compressible(headers.get("content-type"))
    ) {
        body = body
            .pipeThrough(
                new TransformStream<Uint8Array, BufferSource>({
                    transform(chunk, controller) {
                        controller.enqueue(new Uint8Array(chunk).buffer);
                    },
                }),
            )
            .pipeThrough(new CompressionStream("gzip"));
        headers.set("content-encoding", "gzip");
        headers.delete("content-length");
        const tag = headers.get("etag");
        if (tag && !tag.startsWith("W/")) {
            headers.set("etag", `W/${tag}`);
        }
    }
    return new Response(body, { status: response.status, headers });
}
