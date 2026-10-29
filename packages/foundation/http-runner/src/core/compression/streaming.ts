import { ifNoneMatchMatches } from "../byteRanges";
import { acceptsGzip, acceptsIdentity, isCompressibleType } from "./negotiation";

/** Apply browser negotiation without buffering the origin body or recompressing an encoded response. */
export async function prepareStreamingResponse(request: Request, response: Response): Promise<Response> {
    const headers = new Headers(response.headers);
    let body = response.body;
    const gzip =
        response.status === 200 &&
        request.method !== "HEAD" &&
        !headers.has("content-encoding") &&
        isCompressibleType(headers.get("content-type")) &&
        acceptsGzip(request.headers.get("accept-encoding"));
    if (gzip) {
        headers.set("content-encoding", "gzip");
        headers.delete("content-length");
        const tag = headers.get("etag");
        if (tag && !tag.startsWith("W/")) {
            headers.set("etag", `W/${tag}`);
        }
    }
    if (
        response.status === 200 &&
        ["GET", "HEAD"].includes(request.method) &&
        ifNoneMatchMatches(request.headers.get("if-none-match"), (headers.get("etag") ?? "").replace(/^W\//u, ""))
    ) {
        await body?.cancel();
        headers.delete("content-length");
        return new Response(null, { status: 304, headers });
    }
    if (
        response.status === 200 &&
        !headers.has("content-encoding") &&
        !acceptsIdentity(request.headers.get("accept-encoding"))
    ) {
        await body?.cancel();
        return new Response(null, { status: 406, headers: { "cache-control": "no-store" } });
    }
    if (gzip && body) {
        body = body
            .pipeThrough(
                new TransformStream<Uint8Array, BufferSource>({
                    transform(chunk, controller) {
                        controller.enqueue(new Uint8Array(chunk).buffer);
                    },
                }),
            )
            .pipeThrough(new CompressionStream("gzip"));
    }
    return new Response(body, { status: response.status, headers });
}
