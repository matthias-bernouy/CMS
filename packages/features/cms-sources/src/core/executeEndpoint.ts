import type { SourceEndpoint } from "../interfaces/Source";
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
};

const TIMEOUT_MS = 15_000;

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
 *  - Timeout 15 s; redirects NOT followed. Legacy/file bodies remain streamed;
 *    declared JSON bodies are bounded and projected before being returned.
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
    const fwd = await buildForwardHeaders(endpoint, request, built.headers, computed, deps);
    if (!fwd.ok) return fwd.response;

    const body = await upstreamBody(endpoint, request);
    if (!body.ok) return body.response;

    const doFetch = deps?.fetchImpl ?? fetch;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

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
        return await projectEndpointResponse(endpoint, request, upstream, deps);
    } catch (err) {
        const aborted = (err as { name?: string })?.name === "AbortError";
        return new Response(aborted ? "Source Timeout" : "Bad Source", { status: aborted ? 504 : 502 });
    } finally {
        clearTimeout(timer);
    }
}
