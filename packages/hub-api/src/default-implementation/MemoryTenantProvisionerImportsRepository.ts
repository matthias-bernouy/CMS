import type { TenantProvisionerImport } from "src/interfaces/TenantProvisionerImport";
import type { TenantProvisionerImportsRepository } from "src/interfaces/TenantProvisionerImportsRepository";
import { HubError } from "src/core/HubError";

/**
 * In-memory `TenantProvisionerImportsRepository` — tests + dev. Lost on
 * restart. Production should inject `MongoTenantProvisionerImportsRepository`.
 */
export class MemoryTenantProvisionerImportsRepository implements TenantProvisionerImportsRepository {
    private readonly byId = new Map<string, TenantProvisionerImport>();

    async list(): Promise<TenantProvisionerImport[]> {
        return [...this.byId.values()].sort((a, b) => a.providerId.localeCompare(b.providerId));
    }
    async getByProviderId(providerId: string): Promise<TenantProvisionerImport | null> {
        return this.byId.get(providerId) ?? null;
    }
    async getByUrl(url: string): Promise<TenantProvisionerImport | null> {
        for (const v of this.byId.values()) if (v.url === url) return v;
        return null;
    }
    async getByIss(iss: string): Promise<TenantProvisionerImport | null> {
        for (const v of this.byId.values()) if (v.iss === iss) return v;
        return null;
    }
    async insert(doc: TenantProvisionerImport): Promise<TenantProvisionerImport> {
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
        schemas:    TenantProvisionerImport["schemas"],
        cachedAt:   Date,
    ): Promise<TenantProvisionerImport | null> {
        const cur = this.byId.get(providerId);
        if (!cur) return null;
        const next: TenantProvisionerImport = { ...cur, schemas, cachedAt };
        this.byId.set(providerId, next);
        return next;
    }
    async remove(providerId: string): Promise<boolean> {
        return this.byId.delete(providerId);
    }
}
