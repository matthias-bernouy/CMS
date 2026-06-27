import type { GatewayRepository } from "../interfaces/GatewayRepository";
import type { Endpoint } from "../interfaces/Gateway";
import { resolveEndpoint } from "../core/resolveEndpoint";
import { executeEndpoint, type ExecutorDeps } from "../core/executeEndpoint";
import { systemProviderUrnOf } from "../core/systemProviders";

export const CMS_GATEWAY_ROUTE = "/.cms/gateway";
export const GATEWAY_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type GatewaySystemExecutor = (endpoint: Endpoint, request: Request) => Response | Promise<Response>;
export type GatewayEndpointAuthorizer = (endpoint: Endpoint, request: Request) => boolean | Promise<boolean>;
export type GatewayHandlerDeps = ExecutorDeps & {
    executeSystemEndpoint?: GatewaySystemExecutor;
    authorizeEndpoint?: GatewayEndpointAuthorizer;
};

export function gatewayPrefix(basePath: string): string {
    const base = basePath === "/" ? "" : basePath.replace(/\/$/, "");
    return `${base}${CMS_GATEWAY_ROUTE}/`;
}

/**
 * Shared proxy glue used by both delivery (publication) and control (preview):
 * each host passes its own base-path-relative `prefix` (e.g. `<basePath>/.cms/gateway/`)
 * plus optional `deps` (`fetchImpl` / `resolveSecret` / system executors), so
 * an app collapses to one call.
 *
 *  - no gateway configured        → 501
 *  - path not under `prefix`      → 404
 *  - unknown provider/endpoint    → 404
 *  - method mismatch              → 405
 *  - system provider endpoint     → app-owned system executor
 *  - otherwise the executor's response (proxied upstream, see `executeEndpoint`)
 */
export async function handleGatewayRequest(
    gateway: GatewayRepository | null | undefined,
    request: Request,
    opts: { prefix: string; deps?: GatewayHandlerDeps },
): Promise<Response> {
    if (!gateway) return new Response("data gateway not configured", { status: 501 });

    const url = new URL(request.url);
    if (!url.pathname.startsWith(opts.prefix)) return new Response("Not Found", { status: 404 });

    const segments = url.pathname.slice(opts.prefix.length).split("/").filter(Boolean).map(decodeURIComponent);

    const resolved = await resolveEndpoint(gateway, segments, request.method);
    if (!resolved.ok) {
        return new Response(resolved.reason, { status: resolved.reason === "method_not_allowed" ? 405 : 404 });
    }

    if (opts.deps?.authorizeEndpoint && !(await opts.deps.authorizeEndpoint(resolved.endpoint, request))) {
        return new Response("Forbidden", { status: 403 });
    }

    if (systemProviderUrnOf(resolved.endpoint.urn)) {
        if (!opts.deps?.executeSystemEndpoint) {
            return new Response("system gateway executor not configured", { status: 501 });
        }
        return opts.deps.executeSystemEndpoint(resolved.endpoint, request);
    }

    return executeEndpoint(resolved.endpoint, request, opts.deps);
}
