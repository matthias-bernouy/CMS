import type { Collection, IndexDescription } from "mongodb";

import type { BucketDek } from "../../interfaces/entities/BucketDek";
import type { BucketDekRepository } from "../../interfaces/repositories/BucketDekRepository";

/** `bucketId` is `_id`, so the bucket↔DEK uniqueness is enforced natively. */
export type BucketDekDocument = Omit<BucketDek, "bucketId"> & { _id: string };

/**
 * MongoDB-backed `BucketDekRepository`. The `_id` carries the `bucketId`,
 * which is the unique invariant — `_ensureIndexes` only adds the
 * `createdAt` secondary index used for ops dashboards (audit "DEKs
 * created in the last 24h", etc).
 */
export class MongoBucketDekRepository implements BucketDekRepository {

    private readonly _collection: Collection<BucketDekDocument>;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<BucketDekDocument>, config: { createIndexes?: boolean } = {}) {
        this._collection = collection;
        this._indexesReadyPromise = config.createIndexes === false
            ? null
            : this._ensureIndexes().catch((e) => { this._indexesReadyPromise = null; throw e; });
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [
            { key: { createdAt: -1 }, name: "createdAt" },
        ];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async get(bucketId: string): Promise<BucketDek | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: bucketId });
        return doc ? toDek(doc) : null;
    }

    async upsert(dek: BucketDek): Promise<void> {
        await this._ready();
        const { bucketId, ...rest } = dek;
        await this._collection.replaceOne({ _id: bucketId }, rest, { upsert: true });
    }

    async delete(bucketId: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ _id: bucketId });
    }
}

function toDek(doc: BucketDekDocument): BucketDek {
    const { _id, ...rest } = doc;
    return { bucketId: _id, ...rest };
}
