import type { Hub } from "src/exports/Hub";
import { z } from "src/core/schemas/zodInit";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { denestDottedKeys, isPlainObject } from "src/core/denestDottedKeys";
import {
    CreateTenantInputSchema, NamespaceIdSchema, TenantSchema,
} from "src/core/schemas/namespace";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

const QuerySchema = z.object({
    namespaceId: NamespaceIdSchema,
    providerId:  z.string().min(1),
});

export const meta: ApiOperationMeta = {
    summary:     "Add a tenant to a namespace for a TP",
    description: "Mints a hub CP token, POSTs /admin/tenants on the TP with a fresh `tenantId` + issuers + optional `providerConfig`, then mirrors the row. A namespace may hold multiple tenants of the same TP.",
    operationId: "createTenant",
    tags:        ["tenants"],
    request:     { query: QuerySchema, body: CreateTenantInputSchema },
    responses: {
        201: { description: "Created",                  schema: successEnvelope(TenantSchema) },
        400: { description: "Invalid query / body",     schema: HubErrorEnvelope },
        404: { description: "Unknown namespace or TP",  schema: HubErrorEnvelope },
        502: { description: "TP refused / unreachable", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const queryParsed = QuerySchema.safeParse({
        namespaceId: params.get("namespaceId"),
        providerId:  params.get("providerId"),
    });
    if (!queryParsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing `namespaceId` or `providerId` query"));
    }
    let raw: unknown = {};
    try { raw = await req.json(); }
    catch { /* empty OK */ }
    const denested = isPlainObject(raw) ? denestDottedKeys(raw) : raw;
    const bodyParsed = CreateTenantInputSchema.safeParse(denested);
    if (!bodyParsed.success) {
        return hubErrorResponse(new HubError("validation_error",
            bodyParsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")));
    }
    try {
        const t = await hub.createTenant(
            queryParsed.data.namespaceId, queryParsed.data.providerId, bodyParsed.data,
        );
        return Response.json({ ok: true, data: t }, { status: 201 });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
