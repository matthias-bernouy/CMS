import { createHash } from "node:crypto";
import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "@bernouy/cms-integration-packages";

export type PublicRepositoryCache = "catalog" | "immutable";

const CACHE_CONTROL: Record<PublicRepositoryCache, string> = {
    catalog: "public, max-age=60",
    immutable: "public, max-age=31536000, immutable",
};

const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": `ETag, Cache-Control, Content-Length, ${INTEGRATION_PACKAGE_DIGEST_HEADER}`,
};

export type PublicBytesResponseOptions = {
    representationDigest?: string;
    headers?: Readonly<Record<string, string>>;
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
    options: PublicBytesResponseOptions = {},
): Response {
    return publicContentResponse(request, bytes, cache, contentType, options);
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
    options: PublicBytesResponseOptions = {},
): Response {
    const digest = options.representationDigest ?? createHash("sha256").update(bytes).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(digest)) {
        throw new TypeError("Public repository representation digest must be lowercase hexadecimal SHA-256");
    }
    const etag = `"${digest}"`;
    const headers = new Headers({
        ...CORS_HEADERS,
        "cache-control": CACHE_CONTROL[cache],
        "content-length": String(bytes.byteLength),
        "content-type": contentType,
        etag,
        ...options.headers,
    });
    if (matchesEtag(request.headers.get("if-none-match"), etag)) {
        return new Response(null, { status: 304, headers });
    }
    if (request.method === "HEAD") {
        return new Response(null, { headers });
    }
    return new Response(responseBuffer(bytes), { headers });
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

function responseBuffer(bytes: Uint8Array): ArrayBuffer {
    if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
        return bytes.buffer;
    }
    return bytes.slice().buffer as ArrayBuffer;
}
