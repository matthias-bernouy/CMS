import type { Collection } from "mongodb";

import type { Bucket } from "../../interfaces/entities/Bucket";
import type { BucketRepository } from "../../interfaces/repositories/BucketRepository";

/**
 * Document shape stored in Mongo. Distinct from `Bucket` so the storage schema
 * can evolve independently of the public type, and so the user-provided id
 * doubles as Mongo's `_id` (free uniqueness constraint).
 */
export type BucketDocument = Omit<Bucket, "id"> & { _id: string };

/**
 * MongoDB-backed `BucketRepository`. The caller owns the `MongoClient`
 * lifecycle — pass an already-resolved `Collection<BucketDocument>` so the
 * connection can be shared with other repositories.
 */
export class MongoBucketRepository implements BucketRepository {

    private readonly _collection: Collection<BucketDocument>;

    constructor(collection: Collection<BucketDocument>) {
        this._collection = collection;
    }

    async create(bucket: Bucket): Promise<void> {
        const { id, ...rest } = bucket;
        await this._collection.insertOne({ _id: id, ...rest });
    }

    async get(id: string): Promise<Bucket | null> {
        const doc = await this._collection.findOne({ _id: id });
        return doc ? toBucket(doc) : null;
    }

    async update(id: string, patch: Partial<Omit<Bucket, "id" | "createdAt">>): Promise<void> {
        if (Object.keys(patch).length === 0) return;
        await this._collection.updateOne({ _id: id }, { $set: patch });
    }

    async delete(id: string): Promise<void> {
        await this._collection.deleteOne({ _id: id });
    }

    async list(): Promise<Bucket[]> {
        const docs = await this._collection.find().toArray();
        return docs.map(toBucket);
    }
}

function toBucket(doc: BucketDocument): Bucket {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}
