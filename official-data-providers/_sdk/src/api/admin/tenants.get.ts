import type { ProvisioningContext } from "src/types/ProvisioningContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { TenantListSchema } from "src/core/schemas/tenant";
import { listTenants } from "src/core/provisioning/listTenants";

export const meta: ApiOperationMeta = {
    summary:     "List tenants (reconciliation)",
    description: "Inventory for hub↔provider reconciliation (base.md §8). Read-only projection.",
    operationId: "listTenants",
    tags:        ["tenants"],
    responses: {
        200: { description: "Tenant inventory", schema: TenantListSchema },
    },
};

export default async function handle(_req: Request, ctx: ProvisioningContext): Promise<Response> {
    const tenants = await listTenants(ctx);
    return Response.json({ tenants });
}
