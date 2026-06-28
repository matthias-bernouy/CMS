import type { SourceRepository } from "../interfaces/SourceRepository";
import type { SourceEndpoint } from "../interfaces/Source";
import { resolveEndpoint } from "../core/resolveEndpoint";
import { executeEndpoint, type ExecutorDeps } from "../core/executeEndpoint";
import { systemSourceUrnOf } from "../core/systemSources";

export const CMS_SOURCES_ROUTE = "/.cms/sources";
export const SOURCE_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type SourceSystemExecutor = (endpoint: SourceEndpoint, request: Request) => Response | Promise<Response>;
export type SourceEndpointAuthorizer = (endpoint: SourceEndpoint, request: Request) => boolean | Promise<boolean>;
export type SourceHandlerDeps = ExecutorDeps & {
    executeSystemEndpoint?: SourceSystemExecutor;
    authorizeEndpoint?: SourceEndpointAuthorizer;
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

    if (opts.deps?.authorizeEndpoint && !(await opts.deps.authorizeEndpoint(resolved.endpoint, request))) {
        return new Response("Forbidden", { status: 403 });
    }

    if (systemSourceUrnOf(resolved.endpoint.urn)) {
        if (!opts.deps?.executeSystemEndpoint) {
            return new Response("system source executor not configured", { status: 501 });
        }
        return opts.deps.executeSystemEndpoint(resolved.endpoint, request);
    }

    return executeEndpoint(resolved.endpoint, request, opts.deps);
}
