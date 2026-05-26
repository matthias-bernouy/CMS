import type { Db, Collection } from "mongodb";
import type { TenantConfigStore } from "@bernouy/tenant-provisioner-sdk";

interface ConfigDoc {
    _id:    string;   // tenantId
    config: unknown;
}

/**
 * Mongo-backed `TenantConfigStore` (base.md §11): persists each tenant's
 * validated `providerConfig` so the hub's config reads survive a restart.
 * One document per tenant in a shared collection (`cms_tenant_configs` by
 * default), keyed by `tenantId`.
 */
export class MongoTenantConfigStore implements TenantConfigStore {
    constructor(
        private readonly db: Db,
        private readonly collectionName = "cms_tenant_configs",
    ) {}

    private get col(): Collection<ConfigDoc> {
        return this.db.collection<ConfigDoc>(this.collectionName);
    }

    async get(tenantId: string): Promise<unknown | null> {
        const doc = await this.col.findOne({ _id: tenantId });
        return doc ? doc.config : null;
    }

    async save(tenantId: string, config: unknown): Promise<void> {
        await this.col.replaceOne({ _id: tenantId }, { config }, { upsert: true });
    }

    async drop(tenantId: string): Promise<void> {
        await this.col.deleteOne({ _id: tenantId });
    }
}
