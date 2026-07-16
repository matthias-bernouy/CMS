import {
    DEFAULT_SOURCE_ENDPOINT_TIMEOUT_MS,
    MAX_SOURCE_ENDPOINT_TIMEOUT_MS,
    type SourceEndpoint,
} from "../interfaces/Source";
import type { DataShape } from "../interfaces/DataShape";
import type { IdentityService, IdentityValue } from "@bernouy/cms-identities";
import { buildUpstreamUrl, type SourceComputedContext } from "./buildUpstreamUrl";
import {
    buildForwardHeaders,
    hasComputedHeaders,
    hasComputedParams,
} from "./endpointHeaders";
import {
    projectEndpointResponse,
    type ResponseProjectionOptions,
} from "./response-projection/projectEndpointResponse";
import type { UndeclaredUpstreamStatus } from "./upstreamFailure";
import { upstreamBody } from "./upstreamBody";

/** Resolves a server-side secret reference used by source config headers. */
export type SourceSecretResolver = (ref: string) => Promise<string | undefined>;

/**
 * Injected dependencies for the executor.
 *  - `fetchImpl`: test/infra override of the upstream call (default = global `fetch`).
 *  - `resolveSecret`: resolves a `secret`-sourced config header's `ref` to its value
 *    server-side. When provided, `secret` headers ARE applied; when absent, the
 *    executor keeps the 500 seam (a raw `${KEY}` ref is never forwarded upstream).
 *  - response projection options: choose the global compatibility/strict policy
 *    and receive sanitized legacy-contract observability events.
 */
export type ExecutorDeps = ResponseProjectionOptions & {
    fetchImpl?: typeof fetch;
    resolveSecret?: SourceSecretResolver;
    resolveContext?: (request: Request) => Promise<SourceComputedContext>;
    identities?: IdentityService;
    reportFailure?: (failure: UndeclaredUpstreamStatus) => void | Promise<void>;
};

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
 *  - The bounded endpoint timeout (15 s by default) covers the upstream headers
 *    and declared JSON body. Legacy/file bodies remain streamed; declared JSON
 *    bodies are bounded and projected; redirects are NOT followed.
 */
export async function executeEndpoint(
    endpoint: SourceEndpoint,
    request: Request,
    deps?: ExecutorDeps,
): Promise<Response> {
    const identityBindings = endpoint.effects?.identityBindings ?? [];
    const needsContext = hasComputedParams(endpoint) || hasComputedHeaders(endpoint) || identityBindings.length > 0;
    if (hasComputedParams(endpoint) && !deps?.resolveContext) {
        return new Response("computed params require a configured context resolver", { status: 500 });
    }
    if (hasComputedHeaders(endpoint) && !deps?.resolveContext) {
        return new Response("computed headers require a configured context resolver", { status: 500 });
    }
    if (identityBindings.length && !deps?.resolveContext) {
        return new Response("identity binding requires a configured context resolver", { status: 500 });
    }
    const computed = needsContext && deps?.resolveContext ? await deps.resolveContext(request) : {};
    const built = buildUpstreamUrl(endpoint, new URL(request.url).searchParams, computed);
    if (!built.ok) return new Response(built.message, { status: built.status });

    // Request: start from an EMPTY Headers object (inbound cookie / authorization never leak).
    const fwd = await buildForwardHeaders(endpoint, request, built.headers, computed, deps);
    if (!fwd.ok) return fwd.response;

    const body = await upstreamBody(endpoint, request);
    if (!body.ok) return body.response;

    const doFetch = deps?.fetchImpl ?? fetch;
    const ac = new AbortController();
    const timeoutMs = validEndpointTimeout(endpoint.timeoutMs);
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
        const init: RequestInit & { duplex?: "half" } = {
            method:   endpoint.method,
            headers:  fwd.headers,
            redirect: "manual",
            signal:   ac.signal,
        };
        if (body.body !== undefined) {
            init.body = body.body;
            if (body.streaming) init.duplex = "half";
        }
        const upstream = await doFetch(built.url, init);
        const projected = await projectSourceResponse(endpoint, request, upstream, deps);
        const bindingError = await bindResponseIdentities(
            endpoint,
            projected,
            computed,
            deps?.identities,
        );
        return bindingError ?? projected;
    } catch (err) {
        const aborted = (err as { name?: string })?.name === "AbortError";
        return new Response(aborted ? "Source Timeout" : "Bad Source", { status: aborted ? 504 : 502 });
    } finally {
        clearTimeout(timer);
    }
}

function validEndpointTimeout(timeoutMs: number | undefined): number {
    if (timeoutMs === undefined
        || !Number.isSafeInteger(timeoutMs)
        || timeoutMs < 1
        || timeoutMs > MAX_SOURCE_ENDPOINT_TIMEOUT_MS) {
        return DEFAULT_SOURCE_ENDPOINT_TIMEOUT_MS;
    }
    return timeoutMs;
}

async function projectSourceResponse(
    endpoint: SourceEndpoint,
    request: Request,
    upstream: Response,
    deps: ExecutorDeps | undefined,
): Promise<Response> {
    const declared = hasResponseContract(endpoint, upstream.status);
    const legacyStrictFailure = !declared
        && deps?.reportFailure !== undefined
        && deps.responseProjectionMode !== "compatibility";
    const projected = await projectEndpointResponse(endpoint, request, upstream, {
        responseProjectionMode: legacyStrictFailure ? "strict" : deps?.responseProjectionMode,
        reportResponseProjectionEvent: deps?.reportResponseProjectionEvent,
    });
    if (!declared && deps?.reportFailure) {
        reportUndeclaredStatus(endpoint, upstream.status, projected, deps.reportFailure);
    }
    return projected;
}

function hasResponseContract(endpoint: SourceEndpoint, status: number): boolean {
    return endpoint.output?.some(output => output.status === String(status) || output.status === "default") === true;
}

function reportUndeclaredStatus(
    endpoint: SourceEndpoint,
    upstreamStatus: number,
    response: Response,
    reporter: NonNullable<ExecutorDeps["reportFailure"]>,
): void {
    const failure: UndeclaredUpstreamStatus = {
        correlationId: response.headers.get("x-correlation-id") ?? crypto.randomUUID(),
        endpointUrn: endpoint.urn,
        kind: "undeclared_upstream_status",
        upstreamStatus,
    };
    try {
        void Promise.resolve(reporter(failure)).catch(() => undefined);
    } catch {
        // Observability must not change source response behaviour.
    }
}

const MAX_IDENTITY_BINDING_RESPONSE_BYTES = 64 * 1024;

async function bindResponseIdentities(
    endpoint: SourceEndpoint,
    response: Response,
    computed: SourceComputedContext,
    identities: IdentityService | undefined,
): Promise<Response | null> {
    const bindings = endpoint.effects?.identityBindings ?? [];
    if (!bindings.length || !response.ok) return null;
    if (!identities) return new Response("identity service not configured", { status: 500 });
    const subjectId = typeof computed.userID === "string" ? computed.userID.trim() : "";
    if (!subjectId) return new Response("identity binding requires an authenticated user", { status: 401 });
    const parsed = await readIdentityBindingPayload(response);
    if (!parsed.ok) return new Response("identity binding response is invalid", { status: 502 });

    try {
        const outputShape = responseShape(endpoint, response.status);
        for (const binding of bindings) {
            const value = valueAt(parsed.payload, binding.responsePath);
            if (!isIdentityValue(value)) continue;
            const shape = shapeAt(outputShape, binding.responsePath);
            const authority = shape?.semantic?.kind === "user-id" ? shape.semantic.authority : undefined;
            if (!authority) return new Response(`identity binding path is not a qualified user-id: ${binding.responsePath}`, { status: 500 });
            await identities.bind(subjectId, { authority, kind: binding.kind, value });
        }
        return null;
    } catch {
        return new Response("identity binding failed", { status: 502 });
    }
}

function responseShape(endpoint: SourceEndpoint, status: number): DataShape | undefined {
    return endpoint.output?.find(output => output.status === String(status))?.body
        ?? endpoint.output?.find(output => output.status === "default")?.body;
}

function shapeAt(shape: DataShape | undefined, path: string): DataShape | undefined {
    return path.split(".").filter(Boolean).reduce<DataShape | undefined>((current, part) => {
        if (!current) return undefined;
        if (current.type === "array" && /^\d+$/.test(part)) return current.items;
        return current.type === "object" ? current.properties?.[part] : undefined;
    }, shape);
}

function valueAt(value: unknown, path: string): unknown {
    return path.split(".").filter(Boolean).reduce<unknown>((current, part) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
    }, value);
}

function isIdentityValue(value: unknown): value is IdentityValue {
    return (typeof value === "string" && !!value.trim()) || (typeof value === "number" && Number.isFinite(value));
}

async function readIdentityBindingPayload(
    response: Response,
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
    try {
        const body = response.clone().body;
        if (!body) return { ok: false };
        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_IDENTITY_BINDING_RESPONSE_BYTES) {
                await reader.cancel().catch(() => undefined);
                return { ok: false };
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return { ok: true, payload: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
    } catch {
        return { ok: false };
    }
}
