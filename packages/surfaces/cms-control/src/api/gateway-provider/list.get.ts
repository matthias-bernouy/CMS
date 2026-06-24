import type { ControlCms } from "cms-control/ControlCms";
import { isSystemProviderUrn, parseUrn } from "@bernouy/cms-gateway";

/** GET /api/gateway-provider/list — listing rows for the providers table. Carries
 *  both the `urn` (the key the table href + GET/DELETE query string use) and a
 *  derived plain `id`; the two are never conflated. `name` falls back to the id,
 *  never the bare urn. */
export default async function getGatewayProviders(_req: Request, cms: ControlCms) {
    const providers = await cms.gateway.getAllProviders();
    const rows = providers.map(p => {
        const id = parseUrn(p.urn)?.provider ?? "";
        return { urn: p.urn, id, name: p.meta?.name ?? id, endpointCount: p.endpoints.length, readonly: isSystemProviderUrn(p.urn) };
    });
    return new Response(JSON.stringify(rows), {
        headers: { "Content-Type": "application/json" },
    });
}
