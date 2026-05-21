import type { TenantRegistry } from "src/interfaces/TenantRegistry";
import type { ProviderHooks } from "src/interfaces/hooks";
import type { AuditSink } from "src/interfaces/AuditSink";
import type { TenantConfigContext } from "src/types/TenantConfigContext";

/**
 * What the §8 provisioning core/handlers receive. Assembled by the mount
 * `invalidate` is the state-cache invalidation (§5) so a
 * control-plane change is effective immediately, not after the TTL.
 * `tenantConfig` is optional — when present, the SDK validates +
 * persists the §11 providerConfig blob alongside the lifecycle hooks.
 */
export interface ProvisioningContext {
    registry:   TenantRegistry;
    hooks:      ProviderHooks;
    audit:      AuditSink;
    invalidate: (iss: string) => void;
    now:        () => number; // epoch seconds
    tenantConfig?: TenantConfigContext;
}
