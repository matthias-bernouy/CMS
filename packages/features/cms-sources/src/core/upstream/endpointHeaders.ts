import type { ComputedParamRef, SourceEndpoint } from "cms-sources/interfaces/Source";
import type { SourceComputedContext } from "./buildUpstreamUrl";
import { isForbiddenHeaderName } from "./headerPolicy";

const REQUEST_ALLOWLIST = ["accept", "accept-language", "content-type", "range"] as const;
// `fetch` transparently decompresses upstream bodies, so never forward
// content-encoding/content-length from the upstream response.
const RESPONSE_ALLOWLIST = ["content-type", "cache-control", "etag", "last-modified", "age", "date", "vary"] as const;

type HeaderDeps = {
    resolveSecret?: (ref: string) => Promise<string | undefined>;
};

type HeaderResult = { ok: true; headers: Headers } | { ok: false; response: Response };

export type ResponseHeaderProjectionPolicy = Readonly<{
    allowPublicCacheWithUpstreamCookie?: boolean;
}>;

export function hasComputedParams(endpoint: SourceEndpoint): boolean {
    return (endpoint.input?.params ?? []).some((param) => param.source?.from === "computed");
}

export function hasComputedHeaders(endpoint: SourceEndpoint): boolean {
    return (endpoint.headers ?? []).some((header) => header.source.from === "computed");
}

export async function buildForwardHeaders(
    endpoint: SourceEndpoint,
    request: Request,
    builtHeaders: Record<string, string>,
    computed: SourceComputedContext,
    deps: HeaderDeps | undefined,
): Promise<HeaderResult> {
    const headers = new Headers();
    for (const name of REQUEST_ALLOWLIST) {
        const value = request.headers.get(name);
        if (value !== null) {
            headers.set(name, value);
        }
    }
    const paramHeaders = applyHeaderParams(headers, builtHeaders);
    if (!paramHeaders.ok) {
        return paramHeaders;
    }
    return applyConfiguredHeaders(headers, endpoint, computed, deps);
}

export function responseHeaders(upstream: Response, policy: ResponseHeaderProjectionPolicy = {}): Headers {
    const out = new Headers();
    for (const name of RESPONSE_ALLOWLIST) {
        const value = upstream.headers.get(name);
        if (value !== null) {
            out.set(name, value);
        }
    }
    projectVaryHeader(out);
    if (upstream.headers.has("set-cookie") && !policy.allowPublicCacheWithUpstreamCookie) {
        // The credential itself is never forwarded. Mark the projected response
        // unshareable so an inner cache cannot mistake explicit upstream
        // `public` metadata for permission to reuse a personalized body.
        out.set("cache-control", "private, no-store");
    }
    return out;
}

function projectVaryHeader(headers: Headers): void {
    const value = headers.get("vary");
    if (value === null) {
        return;
    }
    const projected = value
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.toLowerCase() !== "accept-encoding");
    if (projected.length === 0) {
        headers.delete("vary");
        return;
    }
    headers.set("vary", projected.join(", "));
}

function applyHeaderParams(headers: Headers, builtHeaders: Record<string, string>): HeaderResult {
    for (const [name, value] of Object.entries(builtHeaders)) {
        try {
            headers.set(name, value);
        } catch {
            return { ok: false, response: new Response(`invalid header param: "${name}"`, { status: 400 }) };
        }
    }
    return { ok: true, headers };
}

async function applyConfiguredHeaders(
    headers: Headers,
    endpoint: SourceEndpoint,
    computed: SourceComputedContext,
    deps: HeaderDeps | undefined,
): Promise<HeaderResult> {
    for (const { name, source } of endpoint.headers ?? []) {
        if (isForbiddenHeaderName(name)) {
            continue;
        }
        if (source.from === "secret") {
            const result = await secretHeaderValue(name, source.ref, source.prefix, deps);
            if (!result.ok) {
                return result;
            }
            try {
                headers.set(name, result.value);
            } catch {
                return { ok: false, response: new Response(`invalid header: "${name}"`, { status: 400 }) };
            }
            continue;
        }
        const value = source.from === "computed" ? computedValue(source.ref, computed) : source.value;
        if (value == null) {
            return { ok: false, response: new Response(`computed header unavailable: "${name}"`, { status: 401 }) };
        }
        try {
            headers.set(name, value);
        } catch {
            return { ok: false, response: new Response(`invalid header: "${name}"`, { status: 400 }) };
        }
    }
    return { ok: true, headers };
}

async function secretHeaderValue(name: string, ref: string, prefix: string | undefined, deps: HeaderDeps | undefined) {
    if (!deps?.resolveSecret) {
        return {
            ok: false as const,
            response: new Response(`secret header requires a configured secret store (not wired yet): ${name}`, {
                status: 500,
            }),
        };
    }
    const value = await deps.resolveSecret(ref);
    if (value == null) {
        return { ok: false as const, response: new Response(`secret not found: ${ref}`, { status: 500 }) };
    }
    return { ok: true as const, value: `${prefix ?? ""}${value}` };
}

function computedValue(ref: ComputedParamRef, computed: SourceComputedContext): string | undefined {
    if (ref === "userID") {
        return computed.userID || undefined;
    }
    if (ref === "userRole") {
        return computed.userRole || undefined;
    }
    return undefined;
}
