import type { Cache, CacheEntry } from "http-runner/interfaces/Cache";
import { getOrGenerateEntry, getOrGenerateEntryAsync } from "http-runner/core/cacheGeneration";
import type { CspExtras } from "../buildCspContent";
import { cspHeaderForEntry, securityHeaders } from "./headers";

/** Options controlling headers and the body-bearing response status. */
export type SendCompressedOptions = {
    skipCspHeader?: boolean;
    cspExtras?: CspExtras;
    status?: number;
};

type Encoding = "br" | "gzip" | "identity";

export function cachedResponse(
    req: Request,
    key: string,
    cache: Cache,
    generate: () => CacheEntry,
    cacheControl?: string,
    opts?: SendCompressedOptions,
): Response {
    return sendCompressed(req, getOrGenerateEntry(key, cache, generate), cacheControl, opts);
}

export async function cachedResponseAsync(
    req: Request,
    key: string,
    cache: Cache,
    generate: () => Promise<CacheEntry>,
    cacheControl?: string,
    opts?: SendCompressedOptions,
): Promise<Response> {
    return sendCompressed(req, await getOrGenerateEntryAsync(key, cache, generate), cacheControl, opts);
}

export function sendCompressed(
    req: Request,
    entry: CacheEntry,
    cacheControl?: string,
    opts?: SendCompressedOptions,
): Response {
    const encoding = responseEncoding(req.headers.get("accept-encoding") || "");
    const csp = opts?.skipCspHeader ? {} : cspHeaderForEntry(entry.contentType, opts?.cspExtras);
    const cacheHeaders: Record<string, string> = cacheControl ? { "Cache-Control": cacheControl } : {};
    const common = { ...securityHeaders(), ...csp, ...cacheHeaders };
    const status = opts?.status ?? 200;
    assertBodyStatus(status);

    const etag = etagFor(entry.hash, encoding);
    if (req.headers.get("if-none-match") === etag) {
        return new Response(null, {
            status: 304,
            headers: { "Vary": "Accept-Encoding", ETag: etag, ...common },
        });
    }

    return new Response(bodyFor(entry, encoding), {
        status,
        headers: { ...representationHeaders(entry, encoding, etag), ...common },
    });
}

function responseEncoding(accept: string): Encoding {
    if (accept.includes("br")) {
        return "br";
    }
    if (accept.includes("gzip")) {
        return "gzip";
    }
    return "identity";
}

function assertBodyStatus(status: number): void {
    if (status < 200 || status > 599 || status === 204 || status === 205 || status === 304) {
        throw new RangeError(`sendCompressed status must allow a response body, got ${status}`);
    }
}

function etagFor(hash: string, encoding: Encoding): string {
    return `"${hash}-${encoding}"`;
}

function representationHeaders(entry: CacheEntry, encoding: Encoding, etag: string): Record<string, string> {
    return {
        "Content-Type": entry.contentType,
        ...(encoding === "identity" ? {} : { "Content-Encoding": encoding }),
        "Vary": "Accept-Encoding",
        ETag: etag,
    };
}

function bodyFor(entry: CacheEntry, encoding: Encoding): BodyInit {
    if (encoding === "br") {
        return entry.brotli as BodyInit;
    }
    if (encoding === "gzip") {
        return entry.gzip as BodyInit;
    }
    return entry.raw as BodyInit;
}
