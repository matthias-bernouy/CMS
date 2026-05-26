import type { Hub } from "src/exports/Hub";
import { z } from "src/core/schemas/zodInit";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import {
    TenantProvisionerImportSchema, TenantProvisionerImportSummarySchema,
} from "src/core/schemas/tenantProvisioner";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

const QuerySchema = z.object({
    providerId: z.string().min(1).optional().openapi({ description: "If set, returns the single TP with that id (incl. cached schemas); otherwise returns the list." }),
});

/** Response shape varies with `?providerId=` presence: list summary by default,
 *  full row with cached schemas when a single provider is requested. */
const ListResultSchema = z.object({ providers: z.array(TenantProvisionerImportSummarySchema) });

export const meta: ApiOperationMeta = {
    summary:     "List imported tenant-provisioners (or get one)",
    description: "Without `?providerId=`: returns the list (summaries — no schemas). With `?providerId=X`: returns the full row including the 4 cached schemas.",
    operationId: "listTenantProvisioners",
    tags:        ["providers"],
    request:     { query: QuerySchema },
    responses: {
        200: { description: "List or single TP",  schema: successEnvelope(z.union([ListResultSchema, TenantProvisionerImportSchema])) },
        404: { description: "Unknown providerId", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const providerId = new URL(req.url).searchParams.get("providerId");
    try {
        if (providerId) {
            const doc = await hub.imports.getByProviderId(providerId);
            if (!doc) throw new HubError("provider_not_found", `unknown providerId "${providerId}"`);
            return Response.json({ ok: true, data: doc });
        }
        const all = await hub.imports.list();
        return Response.json({ ok: true, data: {
            providers: all.map((d) => ({
                providerId:   d.providerId,
                url:          d.url,
                ...(d.name         !== undefined ? { name: d.name }                 : {}),
                ...(d.providerKind !== undefined ? { providerKind: d.providerKind } : {}),
                iss:          d.iss,
                importedAt:   d.importedAt.toISOString(),
                cachedAt:     d.cachedAt.toISOString(),
            })),
        } });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
