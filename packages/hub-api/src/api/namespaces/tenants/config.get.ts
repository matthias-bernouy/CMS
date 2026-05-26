import type { Hub } from "src/exports/Hub";
import { z } from "src/core/schemas/zodInit";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import { TenantIdQuerySchema } from "src/core/schemas/namespace";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Read the live config from the TP for a tenant",
    description: "GETs /admin/config on the TP. Returns 200 with `data: null` when nothing is stored yet (so the UI doesn't see a 404 in DevTools).",
    operationId: "fetchTenantConfig",
    tags:        ["tenants"],
    request:     { query: TenantIdQuerySchema },
    responses: {
        200: { description: "Config from TP",           schema: successEnvelope(z.object({ version: z.string(), config: z.record(z.string(), z.unknown()) }).nullable()) },
        400: { description: "Invalid query",            schema: HubErrorEnvelope },
        404: { description: "Unknown tenant / TP",      schema: HubErrorEnvelope },
        502: { description: "TP refused / unreachable", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const parsed = TenantIdQuerySchema.safeParse({ tenantId: params.get("tenantId") });
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed `tenantId` query"));
    }
    try {
        const data = await hub.fetchTenantConfig(parsed.data.tenantId);
        return Response.json({ ok: true, data });
    } catch (err) {
        if (err instanceof HubError) {
            if (err.code === "tenant_not_found") return Response.json({ ok: true, data: null });
            return hubErrorResponse(err);
        }
        throw err;
    }
}
