import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import { TenantInfoSchema, TenantInfoQuerySchema } from "src/core/schemas/tenantInfo";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Read a tenant's TP-computed info",
    description: "Resolves the tenant's TP and proxies GET /admin/info — read-only facts the provider surfaces (e.g. a realm issuer URL). Distinct from the editable §11 config.",
    operationId: "fetchTenantInfo",
    tags:        ["tenants"],
    request:     { query: TenantInfoQuerySchema },
    responses: {
        200: { description: "Tenant info (may be empty)", schema: successEnvelope(TenantInfoSchema) },
        404: { description: "Unknown tenant or TP",       schema: HubErrorEnvelope },
        502: { description: "TP refused / unreachable",   schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const parsed = TenantInfoQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed query params"));
    }
    try {
        const data = await hub.fetchTenantInfo(parsed.data.tenantId);
        return Response.json({ ok: true, data });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
