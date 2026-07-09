import type { SourceRepository } from "../interfaces/SourceRepository";
import type { SourceEndpoint } from "../interfaces/Source";
import { resolveEndpoint } from "../core/resolveEndpoint";
import { executeEndpoint, type ExecutorDeps } from "../core/executeEndpoint";
import { systemSourceUrnOf } from "../core/systemSources";

export const CMS_SOURCES_ROUTE = "/.cms/sources";
export const SOURCE_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type SourceSystemExecutor = (endpoint: SourceEndpoint, request: Request) => Response | Promise<Response>;
export type SourceEndpointInterceptor = (
    endpoint: SourceEndpoint,
    request: Request,
    next: (req: Request) => Promise<Response>,
) => Promise<Response>;
export type SourceAuthorizationResult = boolean | {
    authorized: boolean;
    status?: 401 | 403;
    body?: string;
};
export type SourceEndpointAuthorizer = (endpoint: SourceEndpoint, request: Request) => SourceAuthorizationResult | Promise<SourceAuthorizationResult>;
export type SourceHandlerDeps = ExecutorDeps & {
    executeSystemEndpoint?: SourceSystemExecutor;
    authorizeEndpoint?: SourceEndpointAuthorizer;
    interceptEndpoint?: SourceEndpointInterceptor;
};

export function sourcesPrefix(basePath: string): string {
    const base = basePath === "/" ? "" : basePath.replace(/\/$/, "");
    return `${base}${CMS_SOURCES_ROUTE}/`;
}

/**
 * Shared proxy glue used by both delivery (publication) and control (preview):
 * each host passes its own base-path-relative `prefix` (e.g. `<basePath>/.cms/sources/`)
 * plus optional `deps` (`fetchImpl` / `resolveSecret` / system executors), so
 * an app collapses to one call.
 *
 *  - no source configured        → 501
 *  - path not under `prefix`      → 404
 *  - unknown source/endpoint    → 404
 *  - method mismatch              → 405
 *  - system source endpoint     → app-owned system executor
 *  - otherwise the executor's response (proxied upstream, see `executeEndpoint`)
 */
export async function handleSourceRequest(
    source: SourceRepository | null | undefined,
    request: Request,
    opts: { prefix: string; deps?: SourceHandlerDeps },
): Promise<Response> {
    if (!source) return new Response("data source not configured", { status: 501 });

    const url = new URL(request.url);
    if (!url.pathname.startsWith(opts.prefix)) return new Response("Not Found", { status: 404 });

    const segments = url.pathname.slice(opts.prefix.length).split("/").filter(Boolean).map(decodeURIComponent);

    const resolved = await resolveEndpoint(source, segments, request.method);
    if (!resolved.ok) {
        return new Response(resolved.reason, { status: resolved.reason === "method_not_allowed" ? 405 : 404 });
    }

    if (opts.deps?.authorizeEndpoint) {
        const authorization = await opts.deps.authorizeEndpoint(resolved.endpoint, request);
        if (!isSourceAuthorized(authorization)) {
            const status = sourceAuthorizationStatus(authorization);
            return new Response(sourceAuthorizationBody(authorization, status), { status });
        }
    }

    const dispatch = (req: Request) => dispatchEndpoint(resolved.endpoint, req, opts.deps);
    return opts.deps?.interceptEndpoint
        ? opts.deps.interceptEndpoint(resolved.endpoint, request, dispatch)
        : dispatch(request);
}

async function dispatchEndpoint(
    endpoint: SourceEndpoint,
    request: Request,
    deps: SourceHandlerDeps | undefined,
): Promise<Response> {
    if (systemSourceUrnOf(endpoint.urn)) {
        if (!deps?.executeSystemEndpoint) {
            return new Response("system source executor not configured", { status: 501 });
        }
        return deps.executeSystemEndpoint(endpoint, request);
    }

    return executeEndpoint(endpoint, request, deps);
}

export function isSourceAuthorized(result: SourceAuthorizationResult): boolean {
    return result === true || (typeof result === "object" && result !== null && result.authorized === true);
}

export function sourceAuthorizationStatus(result: SourceAuthorizationResult): 401 | 403 {
    if (typeof result === "object" && result !== null && (result.status === 401 || result.status === 403)) return result.status;
    return 403;
}

export function sourceAuthorizationBody(result: SourceAuthorizationResult, status: 401 | 403): string {
    if (typeof result === "object" && result !== null && typeof result.body === "string") return result.body;
    return status === 401 ? "Unauthorized" : "Forbidden";
}
