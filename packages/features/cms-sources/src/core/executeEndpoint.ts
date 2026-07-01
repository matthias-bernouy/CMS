import type { ComputedParamRef, SourceEndpoint } from "../interfaces/Source";
import type { DataShape } from "../interfaces/DataShape";
import { buildUpstreamUrl, type SourceComputedContext } from "./buildUpstreamUrl";
import { isForbiddenHeaderName } from "./headerPolicy";

/** Resolves a server-side secret reference used by source config headers. */
export type SourceSecretResolver = (ref: string) => Promise<string | undefined>;

/**
 * Injected dependencies for the executor.
 *  - `fetchImpl`: test/infra override of the upstream call (default = global `fetch`).
 *  - `resolveSecret`: resolves a `secret`-sourced config header's `ref` to its value
 *    server-side. When provided, `secret` headers ARE applied; when absent, the
 *    executor keeps the 500 seam (a raw `${KEY}` ref is never forwarded upstream).
 */
export type ExecutorDeps = {
    fetchImpl?: typeof fetch;
    resolveSecret?: SourceSecretResolver;
    resolveContext?: (request: Request) => Promise<SourceComputedContext>;
};

const TIMEOUT_MS = 15_000;
const REQUEST_ALLOWLIST  = ["accept", "accept-language", "content-type", "range"] as const;
// `fetch` transparently DECOMPRESSES the upstream body, so the re-served body is
// plain — NEVER forward `content-encoding`/`content-length` (they describe the
// upstream's compressed bytes; a client would then fail to gunzip / truncate).
// The runtime sets the correct length for the streamed body.
const RESPONSE_ALLOWLIST = ["content-type", "cache-control", "etag", "last-modified"] as const;

type UpstreamBody =
    | { ok: true; body?: BodyInit; streaming: boolean }
    | { ok: false; response: Response };

class BodyCoercionError extends Error {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Executor proxy (step 0). Takes an ALREADY resolved `SourceEndpoint` + the incoming
 * request, builds the upstream call and forwards it.
 *
 *  - Upstream URL: path/query from `input.params` (see `buildUpstreamUrl`);
 *  - Request headers: inbound allowlist (accept / accept-language / content-type /
 *    range) — inbound cookie / authorization / host / hop-by-hop never leak — then
 *    header-params, then config `endpoint.headers` (config wins, last `.set`). A
 *    config header named `authorization` IS allowed (the 'never authorization'
 *    rule applies only to INBOUND forwarding); forbidden/hop-by-hop names are skipped.
 *  - `secret`-sourced config headers are NOT applied: they return 500 (the scoped
 *    seam — a raw `${KEY}` ref is never forwarded upstream until the store is wired).
 *  - Response headers: allowlist; `set-cookie` / `access-control-*` / hop-by-hop dropped;
 *  - Timeout 15 s, body streamed without buffering; redirects NOT followed.
 */
export async function executeEndpoint(
    endpoint: SourceEndpoint,
    request: Request,
    deps?: ExecutorDeps,
): Promise<Response> {
    const needsContext = hasComputedParams(endpoint) || hasComputedHeaders(endpoint);
    if (hasComputedParams(endpoint) && !deps?.resolveContext) {
        return new Response("computed params require a configured context resolver", { status: 500 });
    }
    if (hasComputedHeaders(endpoint) && !deps?.resolveContext) {
        return new Response("computed headers require a configured context resolver", { status: 500 });
    }
    const computed = needsContext && deps?.resolveContext ? await deps.resolveContext(request) : {};
    const built = buildUpstreamUrl(endpoint, new URL(request.url).searchParams, computed);
    if (!built.ok) return new Response(built.message, { status: built.status });

    // Request: start from an EMPTY Headers object (inbound cookie / authorization never leak).
    const fwd = new Headers();
    for (const name of REQUEST_ALLOWLIST) {
        const v = request.headers.get(name);
        if (v !== null) fwd.set(name, v);
    }
    for (const [name, value] of Object.entries(built.headers)) {
        try { fwd.set(name, value); }
        catch { return new Response(`invalid header param: "${name}"`, { status: 400 }); }
    }
    // Config headers win over forwarded ones (last `.set`). Defense-in-depth: skip
    // forbidden names (the parser already drops them). Secret refs are resolved via
    // `deps.resolveSecret` when wired; without it → 500 (never forward a raw ref).
    for (const { name, source } of endpoint.headers ?? []) {
        if (isForbiddenHeaderName(name)) continue;
        if (source.from === "secret") {
            if (!deps?.resolveSecret) {
                return new Response(`secret header requires a configured secret store (not wired yet): ${name}`, { status: 500 });
            }
            const v = await deps.resolveSecret(source.ref);
            if (v == null) return new Response(`secret not found: ${source.ref}`, { status: 500 });
            try { fwd.set(name, `${source.prefix ?? ""}${v}`); }
            catch { return new Response(`invalid header: "${name}"`, { status: 400 }); }
            continue;
        }
        if (source.from === "computed") {
            const v = computedValue(source.ref, computed);
            if (v == null) return new Response(`computed header unavailable: "${name}"`, { status: 401 });
            try { fwd.set(name, v); }
            catch { return new Response(`invalid header: "${name}"`, { status: 400 }); }
            continue;
        }
        try { fwd.set(name, source.value); }
        catch { return new Response(`invalid header: "${name}"`, { status: 400 }); }
    }

    const body = await upstreamBody(endpoint, request);
    if (!body.ok) return body.response;

    const doFetch = deps?.fetchImpl ?? fetch;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

    let upstream: Response;
    try {
        const init: RequestInit & { duplex?: "half" } = {
            method:   endpoint.method,
            headers:  fwd,
            redirect: "manual",
            signal:   ac.signal,
        };
        if (body.body !== undefined) {
            init.body = body.body;
            if (body.streaming) init.duplex = "half";
        }
        upstream = await doFetch(built.url, init);
    } catch (err) {
        const aborted = (err as { name?: string })?.name === "AbortError";
        return new Response(aborted ? "Source Timeout" : "Bad Source", { status: aborted ? 504 : 502 });
    } finally {
        clearTimeout(timer);
    }

    const out = new Headers();
    for (const name of RESPONSE_ALLOWLIST) {
        const v = upstream.headers.get(name);
        if (v !== null) out.set(name, v);
    }
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

function hasComputedParams(endpoint: SourceEndpoint): boolean {
    return (endpoint.input?.params ?? []).some((param) => param.source?.from === "computed");
}

function hasComputedHeaders(endpoint: SourceEndpoint): boolean {
    return (endpoint.headers ?? []).some((header) => header.source.from === "computed");
}

function computedValue(ref: ComputedParamRef, computed: SourceComputedContext): string | undefined {
    if (ref === "userID") return computed.userID || undefined;
    return undefined;
}

async function upstreamBody(endpoint: SourceEndpoint, request: Request): Promise<UpstreamBody> {
    if (endpoint.method === "GET" || endpoint.method === "HEAD" || request.body == null) {
        return { ok: true, streaming: false };
    }

    const shape = endpoint.input?.body;
    if (!shape || !isJsonRequest(request)) {
        return { ok: true, body: request.body, streaming: true };
    }

    let value: unknown;
    try {
        value = await request.json();
    } catch {
        return { ok: false, response: new Response("invalid JSON body", { status: 400 }) };
    }

    try {
        return {
            ok: true,
            body: JSON.stringify(coerceBodyValue(value, shape, "body")),
            streaming: false,
        };
    } catch (error) {
        if (error instanceof BodyCoercionError) {
            return { ok: false, response: new Response(error.message, { status: 400 }) };
        }
        throw error;
    }
}

function isJsonRequest(request: Request): boolean {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    return contentType.includes("application/json") || contentType.includes("+json");
}

function coerceBodyValue(value: unknown, shape: DataShape, path: string): unknown {
    if (shape.type === "boolean") return coerceBoolean(value, path);
    if (shape.type === "object") return coerceObject(value, shape, path);
    if (shape.type === "array") return coerceArray(value, shape, path);
    return value;
}

function coerceObject(value: unknown, shape: DataShape, path: string): unknown {
    if (!isRecord(value) || !shape.properties) return value;
    const next: Record<string, unknown> = { ...value };
    for (const [key, child] of Object.entries(shape.properties)) {
        if (!Object.hasOwn(value, key)) continue;
        next[key] = coerceBodyValue(value[key], child, `${path}.${key}`);
    }
    return next;
}

function coerceArray(value: unknown, shape: DataShape, path: string): unknown {
    if (!Array.isArray(value) || !shape.items) return value;
    return value.map((item, index) => coerceBodyValue(item, shape.items!, `${path}.${index}`));
}

function coerceBoolean(value: unknown, path: string): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
        if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") return false;
    }
    if (typeof value === "number") {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    throw new BodyCoercionError(`${path} must be a boolean`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
