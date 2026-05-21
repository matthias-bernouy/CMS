import type { DataProviderImport } from "src/interfaces/DataProviderImport";
import type { DataProviderImportsRepository } from "src/interfaces/DataProviderImportsRepository";
import { HubError } from "src/core/HubError";

/**
 * In-memory `DataProviderImportsRepository` — tests + dev. Lost on
 * restart. Production should inject `MongoDataProviderImportsRepository`.
 */
export class MemoryDataProviderImportsRepository implements DataProviderImportsRepository {
    private readonly byId = new Map<string, DataProviderImport>();

    async list(): Promise<DataProviderImport[]> {
        return [...this.byId.values()].sort((a, b) => a.providerId.localeCompare(b.providerId));
    }
    async getByProviderId(providerId: string): Promise<DataProviderImport | null> {
        return this.byId.get(providerId) ?? null;
    }
    async getByUrl(url: string): Promise<DataProviderImport | null> {
        for (const v of this.byId.values()) if (v.url === url) return v;
        return null;
    }
    async getByIss(iss: string): Promise<DataProviderImport | null> {
        for (const v of this.byId.values()) if (v.iss === iss) return v;
        return null;
    }
    async insert(doc: DataProviderImport): Promise<DataProviderImport> {
        if (this.byId.has(doc.providerId)) {
            throw new HubError("duplicate_provider_id", `providerId "${doc.providerId}" already imported`);
        }
        for (const v of this.byId.values()) {
            if (v.url === doc.url) throw new HubError("duplicate_provider_id", `url "${doc.url}" already imported (providerId=${v.providerId})`);
            if (v.iss === doc.iss) throw new HubError("duplicate_provider_id", `iss "${doc.iss}" already imported (providerId=${v.providerId})`);
        }
        this.byId.set(doc.providerId, doc);
        return doc;
    }
    async updateSchemas(
        providerId: string,
        schemas:    DataProviderImport["schemas"],
        cachedAt:   Date,
    ): Promise<DataProviderImport | null> {
        const cur = this.byId.get(providerId);
        if (!cur) return null;
        const next: DataProviderImport = { ...cur, schemas, cachedAt };
        this.byId.set(providerId, next);
        return next;
    }
    async remove(providerId: string): Promise<boolean> {
        return this.byId.delete(providerId);
    }
}
