import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import { TenantLogsQuerySchema, LogPageSchema } from "src/core/schemas/logs";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Read a tenant's logs",
    description: "Resolves the tenant's DP, then proxies GET /admin/logs scoped to that tenant. Filters kind/level/time, bounded pagination via cursor.",
    operationId: "fetchTenantLogs",
    tags:        ["logs"],
    request:     { query: TenantLogsQuerySchema },
    responses: {
        200: { description: "Bounded log page",         schema: successEnvelope(LogPageSchema) },
        400: { description: "Invalid query",            schema: HubErrorEnvelope },
        404: { description: "Unknown tenant or DP",     schema: HubErrorEnvelope },
        502: { description: "DP refused / unreachable", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const parsed = TenantLogsQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed query params"));
    }
    const { tenantId, ...query } = parsed.data;
    try {
        const data = await hub.fetchTenantLogs(tenantId, query);
        return Response.json({ ok: true, data });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
