import type { AllowlistRole } from "src/interfaces/ProviderConfig";

/**
 * Tenant registry contract (base.md §4.4 / §5 / §8). Authoritative store of
 * the `iss → tenant` mapping, auto-populated by provisioning. Note: the
 * JWKS URI is **discovered dynamically** at verify time (base.md §4.4),
 * never persisted here.
 */
export type TenantStatus = "active" | "suspended";

export interface TenantState {
    tenantId:    string;
    /** Trusted issuers for this tenant — tokens whose `iss` is in this list
     *  resolve to this tenant with role `tenant`. May be empty (an
     *  issuer-only provider that consumes no external IdP). Each iss is
     *  globally unique across tenants. */
    issuers:     string[];
    role:        AllowlistRole; // "tenant" for provisioned tenants
    status:      TenantStatus;
    displayName?: string;
    plan?:       string;
}

export interface TenantUpsert {
    tenantId:    string;
    /** Trusted issuers (default []). */
    issuers?:    string[];
    displayName?: string;
    plan?:       string;
    /** Opaque provider-specific config (base.md §11). Transported to the
     *  `onProvision` hook; never persisted by the SDK. */
    providerConfig?: unknown;
}

export interface TenantPatch {
    /** Replace the full trusted-issuer list. */
    issuers?:    string[];
    status?:     TenantStatus;
    displayName?: string;
    plan?:       string;
    /** Opaque provider-specific config patch (base.md §11). Transported to
     *  the `onUpdate` hook; never persisted by the SDK. */
    providerConfig?: unknown;
}

export interface TenantRegistry {
    /** Resolve by issuer (hot path; the SDK caches with a bounded TTL, §5). */
    resolveByIssuer(iss: string): Promise<TenantState | null>;
    get(tenantId: string): Promise<TenantState | null>;
    /** Idempotent on `tenantId` (base.md §8). */
    upsert(t: TenantUpsert): Promise<TenantState>;
    patch(tenantId: string, p: TenantPatch): Promise<TenantState>;
    remove(tenantId: string, opts: { force: boolean }): Promise<void>;
    list(): Promise<TenantState[]>;
}
