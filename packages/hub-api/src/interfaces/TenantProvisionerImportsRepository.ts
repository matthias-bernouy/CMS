import type { TenantProvisionerImport } from "./TenantProvisionerImport";

/**
 * Where the hub persists its meta-registry of imported tenant-provisioners.
 * Pure interface — implementations: `MemoryTenantProvisionerImportsRepository`
 * (tests + dev) and `MongoTenantProvisionerImportsRepository` (prod).
 */
export interface TenantProvisionerImportsRepository {
    list(): Promise<TenantProvisionerImport[]>;
    getByProviderId(providerId: string): Promise<TenantProvisionerImport | null>;
    getByUrl(url: string):               Promise<TenantProvisionerImport | null>;
    getByIss(iss: string):               Promise<TenantProvisionerImport | null>;
    /** Insert; throws on conflict (providerId / url / iss already taken). */
    insert(doc: TenantProvisionerImport):     Promise<TenantProvisionerImport>;
    /** Refresh the schemas + cachedAt of an existing import. */
    updateSchemas(
        providerId: string,
        schemas:    TenantProvisionerImport["schemas"],
        cachedAt:   Date,
    ): Promise<TenantProvisionerImport | null>;
    /** Remove. Returns `true` if a row was removed, `false` if absent. */
    remove(providerId: string): Promise<boolean>;
}
