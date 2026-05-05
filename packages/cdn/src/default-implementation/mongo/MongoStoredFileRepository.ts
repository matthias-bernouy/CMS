import type { Collection, IndexDescription } from "mongodb";

import type { StoredFile } from "../../interfaces/entities/StoredFile";
import type {
    StoredFileRepository,
    StoredFileListOptions,
    StoredFileListResult,
} from "../../interfaces/repositories/StoredFileRepository";

export type StoredFileDocument = Omit<StoredFile, "id"> & { _id: string };

/**
 * MongoDB-backed `StoredFileRepository`. Indexes:
 * - `bucketId + parentFolderID + name` unique.
 * - `bucketId + parentFolderID + createdAt desc` — list pagination.
 * - `bucketId` — quota aggregation.
 */
export class MongoStoredFileRepository implements StoredFileRepository {

    private readonly _collection: Collection<StoredFileDocument>;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<StoredFileDocument>, config: { createIndexes?: boolean } = {}) {
        this._collection = collection;
        this._indexesReadyPromise = config.createIndexes === false
            ? null
            : this._ensureIndexes().catch((e) => { this._indexesReadyPromise = null; throw e; });
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [
            { key: { bucketId: 1, parentFolderID: 1, name: 1 }, unique: true, name: "bucket_parent_name_unique" },
            { key: { bucketId: 1, parentFolderID: 1, createdAt: -1 }, name: "bucket_parent_createdAt" },
            // Partial — `sparse` would still index docs where `publicPath` is null
            // (Mongo's BSON serializes missing / undefined as null), causing duplicate
            // key errors on the second unset insert. The partialFilterExpression
            // narrows the index to docs that actually carry a string value.
            {
                key: { bucketId: 1, publicPath: 1 },
                unique: true,
                partialFilterExpression: { publicPath: { $type: "string" } },
                name: "bucket_publicPath_unique",
            },
        ];
        try {
            await this._collection.createIndexes(indexes);
        } catch (err) {
            // Legacy deployments may already carry a `bucket_publicPath_unique`
            // index that was created with `sparse: true` — its options conflict
            // with the partial filter above, so we drop and recreate. Mongo
            // returns IndexOptionsConflict (code 85) in that case.
            const e = err as { code?: number; codeName?: string };
            if (e.code === 85 || e.codeName === "IndexOptionsConflict") {
                await this._collection.dropIndex("bucket_publicPath_unique").catch(() => {});
                await this._collection.createIndexes(indexes);
            } else {
                throw err;
            }
        }
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async create(file: StoredFile): Promise<void> {
        await this._ready();
        const { id, ...rest } = file;
        await this._collection.insertOne({ _id: id, ...rest });
    }

    async get(id: string): Promise<StoredFile | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: id });
        return doc ? toFile(doc) : null;
    }

    async getByName(bucketId: string, parentFolderID: string | null, name: string): Promise<StoredFile | null> {
        await this._ready();
        const doc = await this._collection.findOne({ bucketId, parentFolderID, name });
        return doc ? toFile(doc) : null;
    }

    async getByPublicPath(bucketId: string, publicPath: string): Promise<StoredFile | null> {
        await this._ready();
        const doc = await this._collection.findOne({ bucketId, publicPath });
        return doc ? toFile(doc) : null;
    }

    async update(id: string, patch: Partial<Pick<StoredFile, "name" | "parentFolderID" | "updatedAt" | "publicPath" | "absoluteURL">>): Promise<void> {
        await this._ready();
        if (Object.keys(patch).length === 0) return;
        await this._collection.updateOne({ _id: id }, { $set: patch });
    }

    async delete(id: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ _id: id });
    }

    async deleteByBucket(bucketId: string): Promise<number> {
        await this._ready();
        const result = await this._collection.deleteMany({ bucketId });
        return result.deletedCount ?? 0;
    }

    async list(opts: StoredFileListOptions): Promise<StoredFileListResult> {
        await this._ready();
        const filter: Record<string, unknown> = { bucketId: opts.bucketId, parentFolderID: opts.parentFolderID };
        if (opts.search) filter.name = { $regex: escapeRegex(opts.search), $options: "i" };

        const sortField = opts.sortBy ?? "createdAt";
        const sortDir   = opts.sortOrder === "asc" ? 1 : -1;

        const page  = Math.max(1, opts.page  ?? 1);
        const limit = Math.max(1, opts.limit ?? 50);
        const skip  = (page - 1) * limit;

        const [docs, total] = await Promise.all([
            this._collection.find(filter).sort({ [sortField]: sortDir }).skip(skip).limit(limit).toArray(),
            this._collection.countDocuments(filter),
        ]);
        return { items: docs.map(toFile), total };
    }

    async sumSize(bucketId: string): Promise<{ totalSize: number; fileCount: number }> {
        await this._ready();
        const pipeline = [
            { $match: { bucketId } },
            { $group: { _id: null, totalSize: { $sum: "$size" }, fileCount: { $sum: 1 } } },
        ];
        const result = await this._collection.aggregate<{ totalSize: number; fileCount: number }>(pipeline).next();
        return result ?? { totalSize: 0, fileCount: 0 };
    }
}

function toFile(doc: StoredFileDocument): StoredFile {
    const { _id, ...rest } = doc;
    // `StoredFile` is a discriminated union over `type`; TS can't prove the
    // narrowing survives the `Omit`+spread round-trip, so we assert.
    return { id: _id, ...rest } as StoredFile;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
