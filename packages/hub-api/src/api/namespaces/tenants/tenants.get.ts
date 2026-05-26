import type { Hub } from "src/exports/Hub";
import { z } from "src/core/schemas/zodInit";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import { TenantSchema } from "src/core/schemas/namespace";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

const QuerySchema = z.object({
    namespaceId: z.string().min(1).optional(),
    providerId:  z.string().min(1).optional(),
    tenantId:    z.string().min(1).optional(),
});

const ListSchema = z.object({ tenants: z.array(TenantSchema) }).openapi("TenantList");

export const meta: ApiOperationMeta = {
    summary:     "List or fetch tenants",
    description: "`?namespaceId=X`: tenants in a namespace. `?providerId=X`: tenants for a TP. `?tenantId=X`: a single tenant (200 + null when absent).",
    operationId: "listTenants",
    tags:        ["tenants"],
    request:     { query: QuerySchema },
    responses: {
        200: { description: "Tenants", schema: successEnvelope(z.union([ListSchema, TenantSchema.nullable()])) },
        400: { description: "Invalid", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const p = new URL(req.url).searchParams;
    const parsed = QuerySchema.safeParse({
        ...(p.get("namespaceId") ? { namespaceId: p.get("namespaceId") } : {}),
        ...(p.get("providerId")  ? { providerId:  p.get("providerId") }  : {}),
        ...(p.get("tenantId")    ? { tenantId:    p.get("tenantId") }    : {}),
    });
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "malformed query params"));
    }
    try {
        if (parsed.data.tenantId) {
            const t = await hub.getTenant(parsed.data.tenantId);
            return Response.json({ ok: true, data: t });
        }
        if (parsed.data.providerId) {
            const tenants = await hub.listTenantsByProvider(parsed.data.providerId);
            return Response.json({ ok: true, data: { tenants } });
        }
        if (parsed.data.namespaceId) {
            const tenants = await hub.listTenants(parsed.data.namespaceId);
            return Response.json({ ok: true, data: { tenants } });
        }
        return hubErrorResponse(new HubError("validation_error",
            "one of `namespaceId`, `providerId`, `tenantId` is required"));
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
