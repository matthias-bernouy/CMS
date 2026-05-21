import type { AllowlistRole } from "src/interfaces/ProviderConfig";
import type { TenantState } from "src/interfaces/TenantRegistry";

/**
 * Result of resolving an `iss` (base.md §4.7): the role of the matched
 * allowlist entry (NOT a claim) plus, for provisioned tenants, the live
 * tenant state used for ProviderContext + suspend (§5). `tenant` is `null`
 * for control-plane (the hub) and for static non-registry entries.
 */
export interface ResolvedIssuer {
    role:   AllowlistRole;
    tenant: TenantState | null;
}
