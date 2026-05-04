import type { Collection, IndexDescription } from "mongodb";

import type { Alias } from "../../interfaces/entities/Alias";
import type { AliasRepository } from "../../interfaces/repositories/AliasRepository";

export type AliasDocument = Omit<Alias, "domain"> & { _id: string };

/**
 * MongoDB-backed `AliasRepository`. The domain is the `_id` (already unique
 * by definition) and `bucketId` is indexed for the per-bucket list view.
 */
export class MongoAliasRepository implements AliasRepository {

    private readonly _collection: Collection<AliasDocument>;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<AliasDocument>, config: { createIndexes?: boolean } = {}) {
        this._collection = collection;
        this._indexesReadyPromise = config.createIndexes === false
            ? null
            : this._ensureIndexes().catch((e) => { this._indexesReadyPromise = null; throw e; });
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [
            { key: { bucketId: 1, createdAt: -1 }, name: "bucket_createdAt" },
        ];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async create(alias: Alias): Promise<void> {
        await this._ready();
        const { domain, ...rest } = alias;
        await this._collection.insertOne({ _id: domain, ...rest });
    }

    async getByDomain(domain: string): Promise<Alias | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: domain });
        return doc ? toAlias(doc) : null;
    }

    async listByBucket(bucketId: string): Promise<Alias[]> {
        await this._ready();
        const docs = await this._collection.find({ bucketId }).sort({ createdAt: -1 }).toArray();
        return docs.map(toAlias);
    }

    async list(): Promise<Alias[]> {
        await this._ready();
        const docs = await this._collection.find({}).sort({ createdAt: -1 }).toArray();
        return docs.map(toAlias);
    }

    async delete(domain: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ _id: domain });
    }
}

function toAlias(doc: AliasDocument): Alias {
    const { _id, ...rest } = doc;
    return { domain: _id, ...rest };
}
