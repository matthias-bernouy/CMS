import type { TenantState } from "src/interfaces/TenantRegistry";
import { SuspendedError } from "src/core/errors";

/**
 * Refuse a suspended tenant before any handler (base.md §5/§8 → 403,
 * mapped by 06). `null` (control-plane / static entry) has no tenant state
 * → nothing to suspend.
 */
export function assertActive(tenant: TenantState | null): void {
    if (tenant && tenant.status === "suspended") {
        throw new SuspendedError(`tenant ${tenant.tenantId} is suspended`);
    }
}
