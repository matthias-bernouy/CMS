import type { GatewayRepository } from "../interfaces/GatewayRepository";
import { resolveEndpoint } from "../core/resolveEndpoint";
import { executeEndpoint, type ExecutorDeps } from "../core/executeEndpoint";

export const CMS_GATEWAY_ROUTE = "/.cms/gateway";
export const GATEWAY_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export function gatewayPrefix(basePath: string): string {
    const base = basePath === "/" ? "" : basePath.replace(/\/$/, "");
    return `${base}${CMS_GATEWAY_ROUTE}/`;
}

/**
 * Shared proxy glue used by both delivery (publication) and control (preview):
 * each host passes its own base-path-relative `prefix` (e.g. `<basePath>/.cms/gateway/`)
 * plus optional `deps` (`fetchImpl` / `resolveSecret`), so an app collapses to one call.
 *
 *  - no gateway configured        → 501
 *  - path not under `prefix`      → 404
 *  - unknown provider/endpoint    → 404
 *  - method mismatch              → 405
 *  - otherwise the executor's response (proxied upstream, see `executeEndpoint`)
 */
export async function handleGatewayRequest(
    gateway: GatewayRepository | null | undefined,
    request: Request,
    opts: { prefix: string; deps?: ExecutorDeps },
): Promise<Response> {
    if (!gateway) return new Response("data gateway not configured", { status: 501 });

    const url = new URL(request.url);
    if (!url.pathname.startsWith(opts.prefix)) return new Response("Not Found", { status: 404 });

    const segments = url.pathname.slice(opts.prefix.length).split("/").filter(Boolean).map(decodeURIComponent);

    const resolved = await resolveEndpoint(gateway, segments, request.method);
    if (!resolved.ok) {
        return new Response(resolved.reason, { status: resolved.reason === "method_not_allowed" ? 405 : 404 });
    }

    return executeEndpoint(resolved.endpoint, request, opts.deps);
}
