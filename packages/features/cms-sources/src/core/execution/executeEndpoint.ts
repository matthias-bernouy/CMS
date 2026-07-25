import {
    DEFAULT_SOURCE_ENDPOINT_TIMEOUT_MS,
    MAX_SOURCE_ENDPOINT_TIMEOUT_MS,
    type SourceEndpoint,
} from "cms-sources/interfaces/Source";
import type { IdentityService } from "@bernouy/cms-identities";
import { buildUpstreamUrl, type SourceComputedContext } from "cms-sources/core/upstream/buildUpstreamUrl";
import {
    allowsPublicCacheWithUpstreamCookie,
    buildForwardHeaders,
    hasComputedHeaders,
    hasComputedParams,
} from "cms-sources/core/upstream/endpointHeaders";
import type { ResponseProjectionOptions } from "cms-sources/core/response-projection/projectEndpointResponse";
import { bindResponseIdentities } from "cms-sources/core/response-projection/bindResponseIdentities";
import type { UndeclaredUpstreamStatus } from "cms-sources/core/upstream/upstreamFailure";
import { upstreamBody } from "cms-sources/core/upstream/upstreamBody";
import type { SourceExecutionObservability } from "cms-sources/interfaces/SourceObservability";
import {
    applyInternalCorrelationHeader,
    timedExecution,
    withTimedSecretResolver,
} from "cms-sources/core/execution/executionObservability";
import { projectSourceResponse } from "cms-sources/core/execution/executeEndpointResponse";

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
export type ExecutorDeps = Omit<ResponseProjectionOptions, "allowPublicCacheWithUpstreamCookie"> & {
    fetchImpl?: typeof fetch;
    resolveSecret?: SourceSecretResolver;
    resolveContext?: (request: Request) => Promise<SourceComputedContext>;
    identities?: IdentityService;
    reportFailure?: (failure: UndeclaredUpstreamStatus) => void | Promise<void>;
    observability?: SourceExecutionObservability;
    isTrustedConnectorTarget?: (endpoint: SourceEndpoint, target: URL) => boolean;
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
    if (identityBindings.length && isMutatingMethod(endpoint.method) && !deps?.identities) {
        return new Response("identity service not configured", { status: 500 });
    }
    const computed =
        needsContext && deps?.resolveContext
            ? await timedExecution(deps, "cms_context", () => deps.resolveContext!(request))
            : {};
    const built = buildUpstreamUrl(endpoint, new URL(request.url).searchParams, computed);
    if (!built.ok) {
        return new Response(built.message, { status: built.status });
    }

    // Request: start from an EMPTY Headers object (inbound cookie / authorization never leak).
    const headerDeps = withTimedSecretResolver(deps);
    const fwd = await timedExecution(deps, "cms_headers", () =>
        buildForwardHeaders(endpoint, request, built.headers, computed, headerDeps),
    );
    if (!fwd.ok) {
        return fwd.response;
    }
    applyInternalCorrelationHeader(endpoint, built.url, fwd.headers, deps);

    const body = await timedExecution(deps, "cms_body", () => upstreamBody(endpoint, request));
    if (!body.ok) {
        return body.response;
    }

    const doFetch = deps?.fetchImpl ?? fetch;
    const ac = new AbortController();
    const timeoutMs = validEndpointTimeout(endpoint.timeoutMs);
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
        const init: RequestInit & { duplex?: "half" } = {
            method: endpoint.method,
            headers: fwd.headers,
            redirect: "manual",
            signal: ac.signal,
        };
        if (body.body !== undefined) {
            init.body = body.body;
            if (body.streaming) {
                init.duplex = "half";
            }
        }
        const upstream = await timedExecution(deps, "cms_upstream", () => doFetch(built.url, init));
        const projected = await timedExecution(deps, "cms_projection", () =>
            projectSourceResponse(
                endpoint,
                request,
                upstream,
                deps,
                allowsPublicCacheWithUpstreamCookie(endpoint, new URL(built.url), deps?.isTrustedConnectorTarget),
            ),
        );
        const bindingError = await timedExecution(deps, "cms_identity_binding", () =>
            bindResponseIdentities(endpoint, projected, computed, deps?.identities),
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
    if (
        timeoutMs === undefined ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > MAX_SOURCE_ENDPOINT_TIMEOUT_MS
    ) {
        return DEFAULT_SOURCE_ENDPOINT_TIMEOUT_MS;
    }
    return timeoutMs;
}

function isMutatingMethod(method: SourceEndpoint["method"]): boolean {
    return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}
