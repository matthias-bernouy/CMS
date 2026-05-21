/**
 * Where the §11 per-tenant `providerConfig` is persisted. Implemented by
 * each provider (Memory / Mongo / Postgres / …), injected at composition
 * via `createProvider({ tenantConfig: { ..., store } })`.
 *
 * Pure type — no executable import (Socle interfaces/ purity).
 */
export interface TenantConfigStore {
    /** Return the stored config for a tenant, or `null` if absent. */
    get(tenantId: string): Promise<unknown | null>;
    /** Persist the validated config; replace any existing entry. */
    save(tenantId: string, config: unknown): Promise<void>;
    /** Remove the config (called on deprovision). Idempotent. */
    drop(tenantId: string): Promise<void>;
}
