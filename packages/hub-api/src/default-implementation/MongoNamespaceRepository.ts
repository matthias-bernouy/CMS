import type { Collection, Db } from "mongodb";
import type { Namespace, Tenant } from "src/interfaces/Namespace";
import type { NamespaceRepository } from "src/interfaces/NamespaceRepository";
import { HubError } from "src/core/HubError";

/** Two collections: `hub_namespaces` (unique on namespaceId) and
 *  `hub_tenants` (unique on tenantId — globally unique across namespaces). */
export class MongoNamespaceRepository implements NamespaceRepository {

    private readonly _ns:      Collection<Namespace>;
    private readonly _tenants: Collection<Tenant>;

    constructor(db: Db) {
        this._ns      = db.collection<Namespace>("hub_namespaces");
        this._tenants = db.collection<Tenant>("hub_tenants");
    }

    async initIndexes(): Promise<void> {
        await this._ns.createIndex({ namespaceId: 1 }, { unique: true });
        await this._tenants.createIndex({ tenantId: 1 }, { unique: true });
        await this._tenants.createIndex({ namespaceId: 1 });
        await this._tenants.createIndex({ providerId: 1 });
    }

    async listNamespaces(): Promise<Namespace[]> {
        return this._ns.find({}).sort({ namespaceId: 1 }).toArray();
    }
    async getNamespace(namespaceId: string): Promise<Namespace | null> {
        return this._ns.findOne({ namespaceId });
    }
    async insertNamespace(ns: Namespace): Promise<Namespace> {
        try {
            await this._ns.insertOne(ns);
            return ns;
        } catch (e) {
            if ((e as { code?: number }).code === 11000) {
                throw new HubError("duplicate_namespace_id", `namespace "${ns.namespaceId}" already exists`);
            }
            throw e;
        }
    }
    async updateNamespace(namespaceId: string, patch: Partial<Pick<Namespace, "displayName" | "description">>): Promise<Namespace | null> {
        const r = await this._ns.findOneAndUpdate(
            { namespaceId }, { $set: patch }, { returnDocument: "after" },
        );
        return r ?? null;
    }
    async removeNamespace(namespaceId: string): Promise<boolean> {
        await this._tenants.deleteMany({ namespaceId });
        const r = await this._ns.deleteOne({ namespaceId });
        return r.deletedCount > 0;
    }

    async listTenants(namespaceId: string): Promise<Tenant[]> {
        return this._tenants.find({ namespaceId }).sort({ tenantId: 1 }).toArray();
    }
    async listTenantsByProvider(providerId: string): Promise<Tenant[]> {
        return this._tenants.find({ providerId }).sort({ tenantId: 1 }).toArray();
    }
    async getTenant(tenantId: string): Promise<Tenant | null> {
        return this._tenants.findOne({ tenantId });
    }
    async insertTenant(t: Tenant): Promise<Tenant> {
        try {
            await this._tenants.insertOne(t);
            return t;
        } catch (e) {
            if ((e as { code?: number }).code === 11000) {
                throw new HubError("duplicate_provision", `tenant "${t.tenantId}" already exists`);
            }
            throw e;
        }
    }
    async updateTenant(
        tenantId: string,
        patch: Partial<Pick<Tenant, "issuers" | "config" | "status" | "displayName">>,
    ): Promise<Tenant | null> {
        const r = await this._tenants.findOneAndUpdate(
            { tenantId }, { $set: patch }, { returnDocument: "after" },
        );
        return r ?? null;
    }
    async removeTenant(tenantId: string): Promise<boolean> {
        const r = await this._tenants.deleteOne({ tenantId });
        return r.deletedCount > 0;
    }
}
