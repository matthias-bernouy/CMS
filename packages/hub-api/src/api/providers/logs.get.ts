import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import { ProviderLogsQuerySchema, LogPageSchema } from "src/core/schemas/logs";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Read a data-provider's logs (all tenants)",
    description: "Proxies the DP's control-plane GET /admin/logs. Filters kind/level/time, bounded pagination via cursor.",
    operationId: "fetchProviderLogs",
    tags:        ["logs"],
    request:     { query: ProviderLogsQuerySchema },
    responses: {
        200: { description: "Bounded log page",         schema: successEnvelope(LogPageSchema) },
        400: { description: "Invalid query",            schema: HubErrorEnvelope },
        404: { description: "Unknown DP",               schema: HubErrorEnvelope },
        502: { description: "DP refused / unreachable", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const parsed = ProviderLogsQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed query params"));
    }
    const { providerId, ...query } = parsed.data;
    try {
        const data = await hub.fetchProviderLogs(providerId, query);
        return Response.json({ ok: true, data });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
