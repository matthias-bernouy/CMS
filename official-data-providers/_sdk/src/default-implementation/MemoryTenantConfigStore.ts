import type { TenantConfigStore } from "src/interfaces/TenantConfigStore";

/**
 * Default in-memory `TenantConfigStore` — for tests and small providers.
 * A real provider injects a persistent store (Mongo / Postgres / …).
 */
export class MemoryTenantConfigStore implements TenantConfigStore {
    private readonly byTenant = new Map<string, unknown>();

    async get(tenantId: string): Promise<unknown | null> {
        return this.byTenant.has(tenantId) ? this.byTenant.get(tenantId)! : null;
    }
    async save(tenantId: string, config: unknown): Promise<void> {
        this.byTenant.set(tenantId, config);
    }
    async drop(tenantId: string): Promise<void> {
        this.byTenant.delete(tenantId);
    }
}
