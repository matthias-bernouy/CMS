import type { ProvisioningContext } from "src/types/ProvisioningContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import {
    TenantPatchSchema, TenantIdQuerySchema, TenantStateSchema, ProblemSchema,
} from "src/core/schemas/tenant";
import { updateTenant } from "src/core/provisioning/updateTenant";
import { getRequestAuth } from "src/core/http/requestAuth";
import { parseOrThrow, jsonBody } from "src/core/http/parse";

export const meta: ApiOperationMeta = {
    summary:     "Update a tenant (issuer rotation / suspend-resume)",
    description: "Mandatory: without issuer rotation a CMS key roll breaks plane 3 (base.md §8). Invalidates the state cache immediately (§5).",
    operationId: "updateTenant",
    tags:        ["tenants"],
    request:     { query: TenantIdQuerySchema, body: TenantPatchSchema },
    responses: {
        200: { description: "Updated tenant",   schema: TenantStateSchema },
        400: { description: "Invalid input",    schema: ProblemSchema },
        404: { description: "Unknown tenant",   schema: ProblemSchema },
        502: { description: "Hook failed",      schema: ProblemSchema },
    },
};

export default async function handle(req: Request, ctx: ProvisioningContext): Promise<Response> {
    const auth = getRequestAuth(req);
    const { tenantId } = parseOrThrow(
        TenantIdQuerySchema,
        Object.fromEntries(new URL(req.url).searchParams),
    );
    const patch = parseOrThrow(TenantPatchSchema, await jsonBody(req));
    const state = await updateTenant(ctx, auth.claims.iss, tenantId, patch);
    return Response.json(state);
}
