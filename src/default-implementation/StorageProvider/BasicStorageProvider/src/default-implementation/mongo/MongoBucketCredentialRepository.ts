import type { Collection, IndexDescription } from "mongodb";

import type { BucketCredential } from "../../interfaces/entities/BucketCredential";
import type { BucketCredentialRepository } from "../../interfaces/repositories/BucketCredentialRepository";

/** Mongo doc shape — `id` becomes `_id`. */
export type BucketCredentialDocument = Omit<BucketCredential, "id"> & { _id: string };

/**
 * MongoDB-backed `BucketCredentialRepository`. Indexes:
 * - `tokenHash` unique — hot path for broker→provider auth.
 * - `bucketId` — used by `listByBucket` and as a TTL discriminator if expiresAt is set.
 *
 * Index creation is idempotent and runs lazily on first call.
 */
export class MongoBucketCredentialRepository implements BucketCredentialRepository {

    private readonly _collection: Collection<BucketCredentialDocument>;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<BucketCredentialDocument>, config: { createIndexes?: boolean } = {}) {
        this._collection = collection;
        this._indexesReadyPromise = config.createIndexes === false
            ? null
            : this._ensureIndexes().catch((e) => {
                this._indexesReadyPromise = null;
                throw e;
            });
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [
            { key: { tokenHash: 1 }, unique: true,  name: "tokenHash_unique" },
            { key: { bucketId:  1, createdAt: -1 }, name: "bucketId_createdAt" },
        ];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async create(credential: BucketCredential): Promise<void> {
        await this._ready();
        const { id, ...rest } = credential;
        await this._collection.insertOne({ _id: id, ...rest });
    }

    async get(id: string): Promise<BucketCredential | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: id });
        return doc ? toCredential(doc) : null;
    }

    async getByTokenHash(tokenHash: string): Promise<BucketCredential | null> {
        await this._ready();
        const doc = await this._collection.findOne({ tokenHash });
        return doc ? toCredential(doc) : null;
    }

    async listByBucket(bucketId: string): Promise<BucketCredential[]> {
        await this._ready();
        const docs = await this._collection.find({ bucketId }).sort({ createdAt: -1 }).toArray();
        return docs.map(toCredential);
    }

    async update(id: string, patch: Partial<Pick<BucketCredential, "label" | "expiresAt" | "revokedAt">>): Promise<void> {
        await this._ready();
        if (Object.keys(patch).length === 0) return;
        await this._collection.updateOne({ _id: id }, { $set: patch });
    }

    async delete(id: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ _id: id });
    }
}

function toCredential(doc: BucketCredentialDocument): BucketCredential {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}
