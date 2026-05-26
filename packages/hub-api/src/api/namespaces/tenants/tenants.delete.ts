import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { TenantDeleteQuerySchema } from "src/core/schemas/namespace";
import { HubErrorEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Remove a tenant",
    description: "DELETE /admin/tenants on the TP, then drop the local row. `?force=true` overrides the TP's grace policy (base.md §8).",
    operationId: "removeTenant",
    tags:        ["tenants"],
    request:     { query: TenantDeleteQuerySchema },
    responses: {
        204: { description: "Removed" },
        400: { description: "Invalid query",            schema: HubErrorEnvelope },
        502: { description: "TP refused / unreachable", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const parsed = TenantDeleteQuerySchema.safeParse({
        tenantId: params.get("tenantId"),
        ...(params.get("force") ? { force: params.get("force") } : {}),
    });
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed `tenantId` query"));
    }
    try {
        await hub.removeTenant(parsed.data.tenantId, {
            ...(parsed.data.force === "true" ? { force: true } : {}),
        });
        return new Response(null, { status: 204 });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
