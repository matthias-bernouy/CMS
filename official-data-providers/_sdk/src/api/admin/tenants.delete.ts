import type { ProvisioningContext } from "src/types/ProvisioningContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { DeleteQuerySchema, ProblemSchema } from "src/core/schemas/tenant";
import { deprovisionTenant } from "src/core/provisioning/deprovisionTenant";
import { getRequestAuth } from "src/core/http/requestAuth";
import { parseOrThrow } from "src/core/http/parse";

export const meta: ApiOperationMeta = {
    summary:     "Deprovision a tenant",
    description: "Provider's default policy (grace vs immediate); `force=true` → immediate irreversible purge, overrides grace (base.md §8).",
    operationId: "deprovisionTenant",
    tags:        ["tenants"],
    request:     { query: DeleteQuerySchema },
    responses: {
        204: { description: "Deprovisioned (or scheduled)" },     // no body
        400: { description: "Invalid query",                schema: ProblemSchema },
        502: { description: "Hook failed",                  schema: ProblemSchema },
    },
};

export default async function handle(req: Request, ctx: ProvisioningContext): Promise<Response> {
    const auth = getRequestAuth(req);
    const q = parseOrThrow(DeleteQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
    await deprovisionTenant(ctx, auth.claims.iss, q.tenantId, q.force === "true");
    return new Response(null, { status: 204 });
}
