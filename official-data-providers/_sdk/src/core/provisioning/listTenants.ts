import type { ProvisioningContext } from "src/types/ProvisioningContext";
import type { TenantState } from "src/interfaces/TenantRegistry";

/**
 * §8 `GET /admin/tenants` — inventory for hub↔provider reconciliation
 * (the hub is the source of truth; the provider drifts on failed calls).
 */
export async function listTenants(ctx: ProvisioningContext): Promise<TenantState[]> {
    return ctx.registry.list();
}
