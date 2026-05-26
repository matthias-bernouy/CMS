import type { TenantConfigEndpointContext } from "src/types/SdkContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import {
    TenantConfigResponseSchema, TenantConfigPatchBodySchema,
} from "src/core/schemas/tenantConfigResponse";
import { ProblemSchema } from "src/core/schemas/tenant";
import { requireTenantScope } from "src/core/http/requireTenantScope";
import { getRequestAuth } from "src/core/http/requestAuth";
import { jsonBody, parseOrThrow } from "src/core/http/parse";
import { stripWriteOnly } from "src/core/tenantConfig/stripWriteOnly";
import { assertTenantWritable } from "src/core/tenantConfig/filterWritable";
import { AuthError, ProvisioningError } from "src/core/errors";

export const meta: ApiOperationMeta = {
    summary:     "Update this tenant's provider config (partial)",
    description: "base.md §11.4 — scope `tenant` only. Body fields must be in `x-writable-by: tenant`. Validation is partial, then merged with stored config and full-validated for cross-field invariants.",
    operationId: "tenantPatchConfig",
    tags:        ["tenants"],
    request:     { body: TenantConfigPatchBodySchema },
    responses: {
        200: { description: "Updated config (writeOnly stripped)", schema: TenantConfigResponseSchema },
        400: { description: "Invalid body",                         schema: ProblemSchema },
        403: { description: "Field not writable by tenant",         schema: ProblemSchema },
        404: { description: "No config available",                  schema: ProblemSchema },
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

    const body = (await jsonBody(req)) as Record<string, unknown>;
    assertTenantWritable(ctx.tenantConfig.schema, body);                  // 403 on forbidden
    const validated = parseOrThrow(ctx.tenantConfig.partial, body);       // 400 on bad shape

    const current = (await ctx.tenantConfig.store.get(tenantId)) as Record<string, unknown> | null;
    const merged  = { ...(current ?? {}), ...(validated as Record<string, unknown>) };
    const full    = parseOrThrow(ctx.tenantConfig.zod, merged);           // cross-field
    await ctx.tenantConfig.store.save(tenantId, full);

    const filtered = stripWriteOnly(
        full as Record<string, unknown>,
        ctx.tenantConfig.schema,
    );
    return Response.json({ version: ctx.tenantConfig.version, config: filtered });
}
