import { gzipSync } from "node:zlib";

/** Compress the authenticated route representation; never cache a mutable authority snapshot. */
export async function routeResponse(request: Request, response: Response): Promise<Response> {
    if (
        !request.headers
            .get("accept-encoding")
            ?.split(",")
            .some((part) => /^gzip(?:\s*;\s*q=1(?:\.0{0,3})?)?$/iu.test(part.trim()))
    ) {
        return response;
    }
    const bytes = gzipSync(await response.arrayBuffer(), { level: 1 });
    const headers = new Headers(response.headers);
    headers.set("content-encoding", "gzip");
    headers.set("content-length", String(bytes.length));
    headers.set("vary", "Accept-Encoding");
    return new Response(bytes, { status: response.status, headers });
}
