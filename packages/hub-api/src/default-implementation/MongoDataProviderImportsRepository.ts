import type { Collection, Db } from "mongodb";
import type { DataProviderImport } from "src/interfaces/DataProviderImport";
import type { DataProviderImportsRepository } from "src/interfaces/DataProviderImportsRepository";
import { HubError } from "src/core/HubError";

/**
 * Mongo-backed `DataProviderImportsRepository` for prod. The collection
 * is `data_provider_imports`. Three unique indexes are created at
 * `initIndexes()` time: providerId, url, iss.
 *
 * Untested at unit level (no in-memory Mongo is wired in this repo); the
 * `MemoryDataProviderImportsRepository` covers semantics. Bug-finding
 * relies on integration in deployments.
 */
export class MongoDataProviderImportsRepository implements DataProviderImportsRepository {
    private readonly col: Collection<DataProviderImport>;

    constructor(db: Db) {
        this.col = db.collection<DataProviderImport>("data_provider_imports");
    }

    async initIndexes(): Promise<void> {
        await this.col.createIndex({ providerId: 1 }, { unique: true });
        await this.col.createIndex({ url:        1 }, { unique: true });
        await this.col.createIndex({ iss:        1 }, { unique: true });
    }

    async list(): Promise<DataProviderImport[]> {
        return this.col.find({}).sort({ providerId: 1 }).toArray();
    }
    async getByProviderId(providerId: string): Promise<DataProviderImport | null> {
        return this.col.findOne({ providerId });
    }
    async getByUrl(url: string): Promise<DataProviderImport | null> {
        return this.col.findOne({ url });
    }
    async getByIss(iss: string): Promise<DataProviderImport | null> {
        return this.col.findOne({ iss });
    }
    async insert(doc: DataProviderImport): Promise<DataProviderImport> {
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
        schemas:    DataProviderImport["schemas"],
        cachedAt:   Date,
    ): Promise<DataProviderImport | null> {
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
