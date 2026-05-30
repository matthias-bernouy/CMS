import type DeliveryCms from "cms-delivery/DeliveryCms";
import { resolveEndpoint, executeEndpoint } from "@bernouy/cms-gateway";

/**
 * Data-gateway proxy. Resolves `<provider>/<endpoint>` under
 * `<basePath>/.cms/gateway/` against the configured `GatewayRepository`, then
 * forwards upstream via `executeEndpoint`.
 *
 *  - no gateway configured        → 501
 *  - unknown provider/endpoint    → 404
 *  - method mismatch              → 405
 *  - otherwise the executor's response (proxied upstream, see cms-gateway)
 */
export default async function GatewayServer(req: Request, delivery: DeliveryCms): Promise<Response> {
    const gateway = delivery.gateway;
    if (!gateway) return new Response("data gateway not configured", { status: 501 });

    const url = new URL(req.url);
    const prefix = delivery.cmsPathPrefix + "/gateway/";   // <basePath>/.cms/gateway/
    if (!url.pathname.startsWith(prefix)) return new Response("Not Found", { status: 404 });

    const segments = url.pathname.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent);

    const resolved = await resolveEndpoint(gateway, segments, req.method);
    if (!resolved.ok) {
        return new Response(resolved.reason, { status: resolved.reason === "method_not_allowed" ? 405 : 404 });
    }

    return executeEndpoint(resolved.endpoint, req);
}
