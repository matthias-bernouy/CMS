import { createHash } from "node:crypto";

export type PublicRepositoryCache = "catalog" | "immutable";

const CACHE_CONTROL: Record<PublicRepositoryCache, string> = {
    catalog: "public, max-age=60",
    immutable: "public, max-age=31536000, immutable",
};

const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "ETag, Cache-Control",
};

export function publicJsonResponse(request: Request, body: unknown, cache: PublicRepositoryCache): Response {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    return publicContentResponse(request, bytes, cache, "application/json; charset=utf-8");
}

export function publicBytesResponse(
    request: Request,
    bytes: Uint8Array,
    cache: PublicRepositoryCache,
    contentType: string,
): Response {
    return publicContentResponse(request, bytes, cache, contentType);
}

export function publicNotFound(message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status: 404,
        headers: {
            ...CORS_HEADERS,
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
        },
    });
}

export function publicErrorResponse(error: unknown): Response {
    const status = (error as { status?: unknown })?.status;
    if (typeof status !== "number" || status < 400 || status > 599) {
        throw error;
    }
    const publicCode = (error as { publicCode?: unknown })?.publicCode;
    return new Response(
        JSON.stringify({
            error: error instanceof Error ? error.message : "Request failed",
            ...(typeof publicCode === "string" ? { code: publicCode } : {}),
        }),
        {
            status,
            headers: {
                ...CORS_HEADERS,
                "cache-control": "no-store",
                "content-type": "application/json; charset=utf-8",
            },
        },
    );
}

export function publicHeadResponse(response: Response): Response {
    return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

export function publicOptionsResponse(): Response {
    return new Response(null, {
        status: 204,
        headers: {
            ...CORS_HEADERS,
            "access-control-allow-headers": "If-None-Match",
            "access-control-allow-methods": "GET, HEAD, OPTIONS",
            "access-control-max-age": "86400",
            "cache-control": "public, max-age=86400",
        },
    });
}

function publicContentResponse(
    request: Request,
    bytes: Uint8Array,
    cache: PublicRepositoryCache,
    contentType: string,
): Response {
    const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
    const headers = {
        ...CORS_HEADERS,
        "cache-control": CACHE_CONTROL[cache],
        "content-type": contentType,
        etag,
    };
    if (matchesEtag(request.headers.get("if-none-match"), etag)) {
        return new Response(null, { status: 304, headers });
    }
    return new Response(arrayBuffer(bytes), { headers });
}

function matchesEtag(header: string | null, etag: string): boolean {
    if (!header) {
        return false;
    }
    const normalizedEtag = etag.replace(/^W\//, "");
    return header.split(",").some((candidate) => {
        const normalized = candidate.trim().replace(/^W\//, "");
        return normalized === "*" || normalized === normalizedEtag;
    });
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}
