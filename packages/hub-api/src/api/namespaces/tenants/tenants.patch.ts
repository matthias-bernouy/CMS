import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { denestDottedKeys, isPlainObject } from "src/core/denestDottedKeys";
import {
    UpdateTenantInputSchema, TenantIdQuerySchema, TenantSchema,
} from "src/core/schemas/namespace";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Update a tenant",
    description: "PATCHes `issuers`, `providerConfig`, and/or `status` on the TP, mirrors in the hub. `displayName` is hub-local only.",
    operationId: "updateTenant",
    tags:        ["tenants"],
    request:     { query: TenantIdQuerySchema, body: UpdateTenantInputSchema },
    responses: {
        200: { description: "Updated",                  schema: successEnvelope(TenantSchema) },
        400: { description: "Invalid",                  schema: HubErrorEnvelope },
        404: { description: "Unknown tenant or TP",     schema: HubErrorEnvelope },
        502: { description: "TP refused / unreachable", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const queryParsed = TenantIdQuerySchema.safeParse({ tenantId: params.get("tenantId") });
    if (!queryParsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed `tenantId` query"));
    }
    let raw: unknown = {};
    try { raw = await req.json(); }
    catch { /* empty OK */ }
    const denested = isPlainObject(raw) ? denestDottedKeys(raw) : raw;
    const bodyParsed = UpdateTenantInputSchema.safeParse(denested);
    if (!bodyParsed.success) {
        return hubErrorResponse(new HubError("validation_error",
            bodyParsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")));
    }
    if (bodyParsed.data.issuers === undefined
        && bodyParsed.data.providerConfig === undefined
        && bodyParsed.data.status === undefined
        && bodyParsed.data.displayName === undefined) {
        return hubErrorResponse(new HubError("validation_error",
            "at least one of `issuers`, `providerConfig`, `status`, `displayName` is required"));
    }
    try {
        const t = await hub.updateTenant(queryParsed.data.tenantId, bodyParsed.data);
        return Response.json({ ok: true, data: t });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
