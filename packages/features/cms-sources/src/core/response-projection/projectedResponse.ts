import { responseHeaders } from "cms-sources/core/upstream/endpointHeaders";

export function passthroughResponse(upstream: Response): Response {
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders(upstream),
    });
}

export async function discardResponseBody(upstream: Response): Promise<Response> {
    await cancelResponseBody(upstream.body);
    const headers = responseHeaders(upstream);
    headers.delete("content-type");
    headers.delete("etag");
    headers.delete("last-modified");
    return new Response(null, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}

export function projectedJsonResponse(upstream: Response, value: unknown): Response {
    const headers = responseHeaders(upstream);
    headers.delete("etag");
    headers.delete("last-modified");
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("x-content-type-options", "nosniff");
    return new Response(JSON.stringify(value), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}

export function isJsonMediaType(contentType: string | null): boolean {
    if (!contentType) {
        return false;
    }
    const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
    return mediaType === "application/json" || /^[^\s/;]+\/[^\s/;]+\+json$/.test(mediaType);
}

export async function cancelResponseBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
    if (body) {
        await body.cancel().catch(() => undefined);
    }
}
