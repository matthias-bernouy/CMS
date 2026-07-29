import { freshPublicCacheControl } from "../policy";
import type { SourceImageDerivative } from "../../interfaces/cache";

export function derivativeResponse(
    derivative: SourceImageDerivative,
    request: Request,
    options: { freshUntil?: number; now: number },
): Response {
    const headers = new Headers({
        "content-type": derivative.contentType,
        etag: derivative.etag,
        "x-content-type-options": "nosniff",
        "cache-control":
            options.freshUntil === undefined
                ? "private, no-store"
                : freshPublicCacheControl(options.freshUntil, options.now),
    });
    if (options.freshUntil !== undefined) {
        headers.set("vary", "Accept, Accept-Language");
    }
    if (matchesEtag(request.headers.get("if-none-match"), derivative.etag)) {
        return new Response(null, { status: 304, headers });
    }
    return new Response(derivative.bytes.slice(), { status: 200, headers });
}

export function invalidSourceImageResponse(message = "Invalid Source Image"): Response {
    return new Response(message, {
        status: 502,
        headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
}

export function sourceImageBusyResponse(): Response {
    return new Response("Source Image Processing Busy", {
        status: 503,
        headers: {
            "cache-control": "no-store",
            "retry-after": "1",
            "x-content-type-options": "nosniff",
        },
    });
}

export function sourceImageFallbackResponse(upstream: Response): Response {
    const headers = new Headers(upstream.headers);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    for (const name of ["age", "etag", "last-modified", "set-cookie"]) {
        headers.delete(name);
    }
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}

export function sourceImageDisabledResponse(): Response {
    return new Response("Source Image Transforms Disabled", {
        status: 503,
        headers: {
            "cache-control": "no-store",
            "retry-after": "1",
            "x-content-type-options": "nosniff",
        },
    });
}

function matchesEtag(header: string | null, etag: string): boolean {
    if (!header) {
        return false;
    }
    return header.split(",").some((candidate) => {
        const normalized = candidate.trim().replace(/^W\//, "");
        return normalized === "*" || normalized === etag;
    });
}
