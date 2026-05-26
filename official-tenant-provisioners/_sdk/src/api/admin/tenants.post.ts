import type { ProvisioningContext } from "src/types/ProvisioningContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { TenantUpsertSchema, TenantStateSchema, ProblemSchema } from "src/core/schemas/tenant";
import { provisionTenant } from "src/core/provisioning/provisionTenant";
import { getRequestAuth } from "src/core/http/requestAuth";
import { parseOrThrow, jsonBody } from "src/core/http/parse";

export const meta: ApiOperationMeta = {
    summary:     "Provision / activate a tenant",
    description: "Idempotent on `tenantId`; conflicting `issuer` → 409. The `issuer` auto-populates the trust allowlist (base.md §8).",
    operationId: "provisionTenant",
    tags:        ["tenants"],
    request:     { body: TenantUpsertSchema },
    responses: {
        200: { description: "Tenant provisioned/active", schema: TenantStateSchema },
        400: { description: "Invalid body",               schema: ProblemSchema },
        409: { description: "tenantId bound to another issuer", schema: ProblemSchema },
        502: { description: "Provider-backend hook failed",     schema: ProblemSchema },
    },
};

export default async function handle(req: Request, ctx: ProvisioningContext): Promise<Response> {
    const auth = getRequestAuth(req);
    const input = parseOrThrow(TenantUpsertSchema, await jsonBody(req));
    const state = await provisionTenant(ctx, auth.claims.iss, input);
    return Response.json(state);
}
