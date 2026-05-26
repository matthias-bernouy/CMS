import type { TenantInfoEndpointContext } from "src/types/SdkContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { TenantInfoSchema, TenantInfoQuerySchema } from "src/core/schemas/tenantInfo";

export const meta: ApiOperationMeta = {
    summary:     "TP-computed info about a tenant",
    description: "Read-only facts the provider surfaces about a tenant (e.g. a realm issuer URL). Control-plane only; distinct from §11 config (which the hub writes). Empty `fields` when the provider declared none.",
    operationId: "tenantInfo",
    tags:        ["tenants"],
    request:     { query: TenantInfoQuerySchema },
    responses: {
        200: { description: "Tenant info (may be empty)", schema: TenantInfoSchema },
    },
};

export default async function handle(req: Request, ctx: TenantInfoEndpointContext): Promise<Response> {
    const tenantId = new URL(req.url).searchParams.get("tenantId");
    if (!tenantId || !ctx.tenantInfo) return Response.json({ fields: [] });
    return Response.json(await ctx.tenantInfo({ tenantId }));
}
