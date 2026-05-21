import type { Namespace, Tenant } from "./Namespace";

/**
 * Two-collection repo backing the hub's namespace registry. Implementations:
 *   - `MemoryNamespaceRepository` (dev / tests)
 *   - `MongoNamespaceRepository`  (prod, two collections under the same db)
 *
 * Pure interface — no executable imports.
 */
export interface NamespaceRepository {
    // ── Namespaces ─────────────────────────────────────────────────────
    listNamespaces(): Promise<Namespace[]>;
    getNamespace(namespaceId: string): Promise<Namespace | null>;
    /** Insert; throws on conflict (namespaceId taken). */
    insertNamespace(ns: Namespace): Promise<Namespace>;
    /** Patch displayName / description. Returns the updated row, or null. */
    updateNamespace(
        namespaceId: string,
        patch:       Partial<Pick<Namespace, "displayName" | "description">>,
    ): Promise<Namespace | null>;
    /** Remove the namespace row AND all its tenants in one shot. */
    removeNamespace(namespaceId: string): Promise<boolean>;

    // ── Tenants (a namespace may hold many, even of the same DP) ────────
    listTenants(namespaceId: string): Promise<Tenant[]>;
    listTenantsByProvider(providerId: string): Promise<Tenant[]>;
    getTenant(tenantId: string): Promise<Tenant | null>;
    /** Insert; throws on conflict (tenantId taken globally). */
    insertTenant(t: Tenant): Promise<Tenant>;
    /** Patch issuers / config / status / displayName. */
    updateTenant(
        tenantId: string,
        patch:    Partial<Pick<Tenant, "issuers" | "config" | "status" | "displayName">>,
    ): Promise<Tenant | null>;
    /** Remove a single tenant row. */
    removeTenant(tenantId: string): Promise<boolean>;
}
