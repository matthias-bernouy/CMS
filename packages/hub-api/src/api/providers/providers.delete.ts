import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope } from "src/core/schemas/envelopes";
import { ProviderIdQuerySchema } from "src/core/schemas/tenantProvisioner";
import { unimportTenantProvisioner } from "src/core/tenantProvisioner/unimportTenantProvisioner";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Unimport (forget) a tenant-provisioner",
    description: "Removes the TP from the hub's meta-registry. Does NOT touch the TP's own tenants — their data stays intact on the TP. To clean up tenants on the TP, call DELETE /api/tenants/providers BEFORE this.",
    operationId: "unimportTenantProvisioner",
    tags:        ["providers"],
    request:     { query: ProviderIdQuerySchema },
    responses: {
        204: { description: "Unimported" },
        400: { description: "Missing providerId", schema: HubErrorEnvelope },
        404: { description: "Unknown providerId", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const parsed = ProviderIdQuerySchema.safeParse({ providerId: new URL(req.url).searchParams.get("providerId") });
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed `providerId` query param"));
    }
    try {
        await unimportTenantProvisioner(hub, parsed.data.providerId);
        return new Response(null, { status: 204 });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
