import type { TenantConfigEndpointContext } from "src/types/SdkContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import {
    TenantConfigResponseSchema,
} from "src/core/schemas/tenantConfigResponse";
import { ProblemSchema } from "src/core/schemas/tenant";
import { requireTenantScope } from "src/core/http/requireTenantScope";
import { getRequestAuth } from "src/core/http/requestAuth";
import { stripWriteOnly } from "src/core/tenantConfig/stripWriteOnly";
import { AuthError, ProvisioningError } from "src/core/errors";

export const meta: ApiOperationMeta = {
    summary:     "Read this tenant's provider config",
    description: "base.md §11.3 / §11.5 — scope `tenant` only (no `sub`). Fields marked `writeOnly` are stripped from the response.",
    operationId: "tenantReadConfig",
    tags:        ["tenants"],
    responses: {
        200: { description: "Tenant config (writeOnly stripped)", schema: TenantConfigResponseSchema },
        404: { description: "No config available",                schema: ProblemSchema },
    },
};

export default async function handle(
    req: Request, ctx: TenantConfigEndpointContext,
): Promise<Response> {
    if (!ctx.tenantConfig) {
        throw new ProvisioningError("provider declared no tenantConfig", 404);
    }
    requireTenantScope(req);
    const auth = getRequestAuth(req);
    const tenantId = auth.tenant?.tenantId;
    if (!tenantId) throw new AuthError();

    const config = await ctx.tenantConfig.store.get(tenantId);
    if (config === null) {
        throw new ProvisioningError(`no config stored for tenant ${tenantId}`, 404);
    }
    const filtered = stripWriteOnly(
        config as Record<string, unknown>,
        ctx.tenantConfig.schema,
    );
    return Response.json({ version: ctx.tenantConfig.version, config: filtered });
}
