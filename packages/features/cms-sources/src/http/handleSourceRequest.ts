import type { SourceRepository } from "../interfaces/SourceRepository";
import type { SourceEndpoint } from "../interfaces/Source";
import { resolveEndpoint } from "../core/execution/resolveEndpoint";
import { executeEndpoint, type ExecutorDeps } from "../core/execution/executeEndpoint";
import { isSystemSourceId } from "../core/system/systemSources";
import {
    activeSourceObservability,
    runObservedSourceRequest,
    setObservedSourceEndpoint,
} from "../core/execution/sourceObservability";
import { timedExecution } from "../core/execution/executionObservability";
import type { SourceExecutionObservability, SourceRequestTelemetryOptions } from "../interfaces/SourceObservability";

export const CMS_SOURCES_ROUTE = "/.cms/sources";
export const SOURCE_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type SourceEndpointInterceptor = (
    endpoint: SourceEndpoint,
    request: Request,
    next: (req: Request) => Promise<Response>,
) => Promise<Response>;
export type SourceAuthorizationResult =
    | boolean
    | {
          authorized: boolean;
          status?: 401 | 403;
          body?: string;
      };
export type SourceEndpointAuthorizer = (
    endpoint: SourceEndpoint,
    request: Request,
    observability?: SourceExecutionObservability,
) => SourceAuthorizationResult | Promise<SourceAuthorizationResult>;
export type SourceHandlerDeps = ExecutorDeps & {
    authorizeEndpoint?: SourceEndpointAuthorizer;
    interceptEndpoint?: SourceEndpointInterceptor;
    telemetry?: SourceRequestTelemetryOptions;
};

export function sourcesPrefix(basePath: string): string {
    const base = basePath === "/" ? "" : basePath.replace(/\/$/, "");
    return `${base}${CMS_SOURCES_ROUTE}/`;
}

/**
 * Shared proxy glue used by internal indexing and Control legacy routes:
 * each host passes its own base-path-relative `prefix` (e.g. `<basePath>/.cms/sources/`)
 * plus optional `deps` (`fetchImpl` / `resolveSecret`), so
 * an app collapses to one call.
 *
 *  - no source configured        → 501
 *  - path not under `prefix`      → 404
 *  - unknown source/endpoint    → 404
 *  - method mismatch              → 405
 *  - reserved system source     → 404
 *  - otherwise the executor's response (proxied upstream, see `executeEndpoint`)
 */
export async function handleSourceRequest(
    source: SourceRepository | null | undefined,
    request: Request,
    opts: { prefix: string; deps?: SourceHandlerDeps },
): Promise<Response> {
    return runObservedSourceRequest(request, opts.deps?.telemetry ?? {}, () =>
        handleObservedSourceRequest(source, request, opts),
    );
}

async function handleObservedSourceRequest(
    source: SourceRepository | null | undefined,
    request: Request,
    opts: { prefix: string; deps?: SourceHandlerDeps },
): Promise<Response> {
    const observability = activeSourceObservability(request);
    const deps = observability ? { ...opts.deps, observability } : opts.deps;
    if (!source) {
        return new Response("data source not configured", { status: 501 });
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith(opts.prefix)) {
        return new Response("Not Found", { status: 404 });
    }

    const segments = url.pathname.slice(opts.prefix.length).split("/").filter(Boolean).map(decodeURIComponent);
    if (segments[0] && isSystemSourceId(segments[0])) {
        return new Response("not_found", { status: 404 });
    }

    const resolved = await timedExecution({ observability }, "cms_endpoint_resolve", () =>
        resolveEndpoint(source, segments, request.method),
    );
    if (!resolved.ok) {
        return unresolvedEndpointResponse(resolved.reason);
    }
    setObservedSourceEndpoint(request, resolved.endpoint.urn);

    if (deps?.authorizeEndpoint) {
        const authorization = await timedExecution({ observability }, "cms_authorize", () =>
            deps.authorizeEndpoint!(resolved.endpoint, request, observability),
        );
        if (!isSourceAuthorized(authorization)) {
            const status = sourceAuthorizationStatus(authorization);
            return new Response(sourceAuthorizationBody(authorization, status), { status });
        }
    }

    const dispatch = async (req: Request) => executeEndpoint(resolved.endpoint, req, deps);
    return deps?.interceptEndpoint ? deps.interceptEndpoint(resolved.endpoint, request, dispatch) : dispatch(request);
}

function unresolvedEndpointResponse(reason: "not_found" | "method_not_allowed"): Response {
    return new Response(reason, { status: reason === "method_not_allowed" ? 405 : 404 });
}

export function isSourceAuthorized(result: SourceAuthorizationResult): boolean {
    return result === true || (typeof result === "object" && result !== null && result.authorized === true);
}

export function sourceAuthorizationStatus(result: SourceAuthorizationResult): 401 | 403 {
    if (typeof result === "object" && result !== null && (result.status === 401 || result.status === 403)) {
        return result.status;
    }
    return 403;
}

export function sourceAuthorizationBody(result: SourceAuthorizationResult, status: 401 | 403): string {
    if (typeof result === "object" && result !== null && typeof result.body === "string") {
        return result.body;
    }
    return status === 401 ? "Unauthorized" : "Forbidden";
}
