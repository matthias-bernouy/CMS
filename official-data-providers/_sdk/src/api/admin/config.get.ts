import type { TenantConfigEndpointContext } from "src/types/SdkContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { z } from "zod";
import {
    TenantConfigResponseSchema,
} from "src/core/schemas/tenantConfigResponse";
import { ProblemSchema } from "src/core/schemas/tenant";
import { parseOrThrow } from "src/core/http/parse";
import { ProvisioningError } from "src/core/errors";

const QuerySchema = z.object({ tenantId: z.string().min(1) });

export const meta: ApiOperationMeta = {
    summary:     "Read a tenant's provider config (raw, control-plane)",
    description: "base.md §11.3 — returns the full providerConfig including any `writeOnly` fields. The control-plane sees everything. 404 if the provider declared no tenantConfig schema, or if the tenant has none stored.",
    operationId: "adminReadTenantConfig",
    tags:        ["tenants"],
    request:     { query: QuerySchema },
    responses: {
        200: { description: "Stored config",        schema: TenantConfigResponseSchema },
        400: { description: "Invalid query",        schema: ProblemSchema },
        404: { description: "No config available",  schema: ProblemSchema },
    },
};

export default async function handle(
    req: Request, ctx: TenantConfigEndpointContext,
): Promise<Response> {
    if (!ctx.tenantConfig) {
        throw new ProvisioningError("provider declared no tenantConfig", 404);
    }
    const { tenantId } = parseOrThrow(
        QuerySchema, Object.fromEntries(new URL(req.url).searchParams),
    );
    const config = await ctx.tenantConfig.store.get(tenantId);
    if (config === null) {
        throw new ProvisioningError(`no config stored for tenant ${tenantId}`, 404);
    }
    return Response.json({ version: ctx.tenantConfig.version, config });
}
