import type { Collection, Db } from "mongodb";
import type { TenantProvisionerImport } from "src/interfaces/TenantProvisionerImport";
import type { TenantProvisionerImportsRepository } from "src/interfaces/TenantProvisionerImportsRepository";
import { HubError } from "src/core/HubError";

/**
 * Mongo-backed `TenantProvisionerImportsRepository` for prod. The collection
 * is `tenant_provisioner_imports`. Three unique indexes are created at
 * `initIndexes()` time: providerId, url, iss.
 *
 * Untested at unit level (no in-memory Mongo is wired in this repo); the
 * `MemoryTenantProvisionerImportsRepository` covers semantics. Bug-finding
 * relies on integration in deployments.
 */
export class MongoTenantProvisionerImportsRepository implements TenantProvisionerImportsRepository {
    private readonly col: Collection<TenantProvisionerImport>;

    constructor(db: Db) {
        this.col = db.collection<TenantProvisionerImport>("tenant_provisioner_imports");
    }

    async initIndexes(): Promise<void> {
        await this.col.createIndex({ providerId: 1 }, { unique: true });
        await this.col.createIndex({ url:        1 }, { unique: true });
        await this.col.createIndex({ iss:        1 }, { unique: true });
    }

    async list(): Promise<TenantProvisionerImport[]> {
        return this.col.find({}).sort({ providerId: 1 }).toArray();
    }
    async getByProviderId(providerId: string): Promise<TenantProvisionerImport | null> {
        return this.col.findOne({ providerId });
    }
    async getByUrl(url: string): Promise<TenantProvisionerImport | null> {
        return this.col.findOne({ url });
    }
    async getByIss(iss: string): Promise<TenantProvisionerImport | null> {
        return this.col.findOne({ iss });
    }
    async insert(doc: TenantProvisionerImport): Promise<TenantProvisionerImport> {
        try {
            await this.col.insertOne(doc);
            return doc;
        } catch (e) {
            if ((e as { code?: number }).code === 11000) {
                throw new HubError("duplicate_provider_id", `import conflicts with an existing one (providerId/url/iss)`);
            }
            throw e;
        }
    }
    async updateSchemas(
        providerId: string,
        schemas:    TenantProvisionerImport["schemas"],
        cachedAt:   Date,
    ): Promise<TenantProvisionerImport | null> {
        const r = await this.col.findOneAndUpdate(
            { providerId },
            { $set: { schemas, cachedAt } },
            { returnDocument: "after" },
        );
        return r ?? null;
    }
    async remove(providerId: string): Promise<boolean> {
        const r = await this.col.deleteOne({ providerId });
        return r.deletedCount > 0;
    }
}
