import type { Collection, Db } from "mongodb";
import type { Tenant } from "src/interfaces/Tenant";
import type { TenantRepository } from "src/interfaces/TenantRepository";

type TenantDoc = Omit<Tenant, "id"> & { _id: string };

/**
 * Mongo-backed `TenantRepository`. Stores tenants in `tenants` collection
 * shared with the per-tenant CMS data (which lives in collections prefixed
 * `tenant_${id}__`). The `_id` is the tenant slug — Mongo's natural unique
 * index covers duplicate-id prevention, no extra index needed.
 */
export class MongoTenantRepository implements TenantRepository {

    private readonly _collection: Collection<TenantDoc>;

    constructor(db: Db, collectionName = "tenants") {
        this._collection = db.collection<TenantDoc>(collectionName);
    }

    async create(tenant: Tenant): Promise<void> {
        const { id, ...rest } = tenant;
        await this._collection.insertOne({ _id: id, ...rest });
    }

    async get(id: string): Promise<Tenant | null> {
        const doc = await this._collection.findOne({ _id: id });
        return doc ? toTenant(doc) : null;
    }

    async list(): Promise<Tenant[]> {
        const docs = await this._collection.find().sort({ _id: 1 }).toArray();
        return docs.map(toTenant);
    }

    async update(id: string, patch: Partial<Omit<Tenant, "id" | "createdAt">>): Promise<Tenant | null> {
        const updatedAt = new Date();
        const doc = await this._collection.findOneAndUpdate(
            { _id: id },
            { $set: { ...patch, updatedAt } },
            { returnDocument: "after" },
        );
        return doc ? toTenant(doc) : null;
    }

    async delete(id: string): Promise<boolean> {
        const res = await this._collection.deleteOne({ _id: id });
        return (res.deletedCount ?? 0) > 0;
    }
}

function toTenant(doc: TenantDoc): Tenant {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}
