import type { Collection, IndexDescription } from "mongodb";

import type { PreSignedToken } from "../../interfaces/entities/PreSignedToken";
import type { PreSignedTokenRepository } from "../../interfaces/repositories/PreSignedTokenRepository";

export type PreSignedTokenDocument = Omit<PreSignedToken, "id"> & { _id: string };

/**
 * MongoDB-backed `PreSignedTokenRepository`. Indexes:
 * - `expiresAt` TTL — Mongo's background monitor evicts expired docs;
 *   `consumeToken` still defends against the ~60 s lag.
 * - `bucketId + createdAt` — operational lookups (rotation / audit).
 *
 * `tryConsume` is a single `findOneAndUpdate` so the consumed/not-consumed
 * decision is atomic at the storage layer.
 */
export class MongoPreSignedTokenRepository implements PreSignedTokenRepository {

    private readonly _collection: Collection<PreSignedTokenDocument>;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<PreSignedTokenDocument>, config: { createIndexes?: boolean } = {}) {
        this._collection = collection;
        this._indexesReadyPromise = config.createIndexes === false
            ? null
            : this._ensureIndexes().catch((e) => { this._indexesReadyPromise = null; throw e; });
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [
            { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "expiresAt_ttl" },
            { key: { bucketId: 1, createdAt: -1 }, name: "bucket_createdAt" },
        ];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async create(token: PreSignedToken): Promise<void> {
        await this._ready();
        const { id, ...rest } = token;
        await this._collection.insertOne({ _id: id, ...rest });
    }

    async get(id: string): Promise<PreSignedToken | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: id });
        return doc ? toToken(doc) : null;
    }

    async tryConsume(id: string): Promise<PreSignedToken | null> {
        await this._ready();
        const doc = await this._collection.findOneAndUpdate(
            { _id: id, consumedAt: { $exists: false } },
            { $set: { consumedAt: new Date() } },
            { returnDocument: "after" },
        );
        return doc ? toToken(doc) : null;
    }

    async deleteExpired(): Promise<number> {
        await this._ready();
        const result = await this._collection.deleteMany({ expiresAt: { $lt: new Date() } });
        return result.deletedCount ?? 0;
    }

    async deleteByBucket(bucketId: string): Promise<number> {
        await this._ready();
        const result = await this._collection.deleteMany({ bucketId });
        return result.deletedCount ?? 0;
    }
}

function toToken(doc: PreSignedTokenDocument): PreSignedToken {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}
