import type { TenantPatch } from "src/interfaces/TenantRegistry";

/**
 * Provider-supplied side effects of the tenant lifecycle (base.md §8).
 * The SDK owns the §8 HTTP contract + registry writes; these hooks apply
 * the provider-backend effects (create/purge the tenant's namespace…).
 */
export interface ProvisionInput {
    tenantId:    string;
    issuers:     string[];
    displayName?: string;
    plan?:       string;
    /** Provider-specific blob (base.md §11). Opaque for the SDK; the
     *  provider validates it via its own zod schema in `onProvision`. */
    providerConfig?: unknown;
}

export interface UpdateInput {
    tenantId: string;
    patch:    TenantPatch;
}

export interface DeprovisionInput {
    tenantId: string;
    force:    boolean;
}

export interface ProviderHooks {
    /** MUST be idempotent (the SDK guarantees HTTP idempotency; the hook
     *  guarantees effect idempotency — base.md §8). */
    onProvision(input: ProvisionInput): Promise<void>;
    onUpdate(input: UpdateInput): Promise<void>;
    onDeprovision(input: DeprovisionInput): Promise<void>;
}
