import type { AllowlistRole } from "src/interfaces/ProviderConfig";
import type { TenantState } from "src/interfaces/TenantRegistry";

/**
 * What a domain handler (plane 2/3) receives after the SDK middleware ran:
 * token verified (§4.5), plane authorized (§4.7), tenant resolved & isolated
 * by `iss` (§5).
 *
 * Decision (02): the raw JWT is **not** exposed — only the minimum needed.
 * `sub` present ⇒ user scope; absent ⇒ anonymous/tenant scope.
 */
export interface ProviderContext {
    tenant: TenantState;
    role:   AllowlistRole;
    sub?:   string;
}
