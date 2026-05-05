import type { Collection, IndexDescription } from "mongodb";

import type { StoredFolder } from "../../interfaces/entities/StoredFolder";
import type {
    StoredFolderRepository,
    StoredFolderListOptions,
    StoredFolderListResult,
} from "../../interfaces/repositories/StoredFolderRepository";

export type StoredFolderDocument = Omit<StoredFolder, "id"> & { _id: string };

/**
 * MongoDB-backed `StoredFolderRepository`. Indexes:
 * - `bucketId + parentFolderID + name` unique — uniqueness check on creation.
 * - `bucketId + parentFolderID + createdAt desc` — list pagination.
 */
export class MongoStoredFolderRepository implements StoredFolderRepository {

    private readonly _collection: Collection<StoredFolderDocument>;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<StoredFolderDocument>, config: { createIndexes?: boolean } = {}) {
        this._collection = collection;
        this._indexesReadyPromise = config.createIndexes === false
            ? null
            : this._ensureIndexes().catch((e) => { this._indexesReadyPromise = null; throw e; });
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [
            { key: { bucketId: 1, parentFolderID: 1, name: 1 }, unique: true, name: "bucket_parent_name_unique" },
            { key: { bucketId: 1, parentFolderID: 1, createdAt: -1 }, name: "bucket_parent_createdAt" },
        ];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async create(folder: StoredFolder): Promise<void> {
        await this._ready();
        const { id, ...rest } = folder;
        await this._collection.insertOne({ _id: id, ...rest });
    }

    async get(id: string): Promise<StoredFolder | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: id });
        return doc ? toFolder(doc) : null;
    }

    async getByName(bucketId: string, parentFolderID: string | null, name: string): Promise<StoredFolder | null> {
        await this._ready();
        const doc = await this._collection.findOne({ bucketId, parentFolderID, name });
        return doc ? toFolder(doc) : null;
    }

    async update(id: string, patch: Partial<Pick<StoredFolder, "name" | "parentFolderID" | "updatedAt" | "itemCount">>): Promise<void> {
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

    async list(opts: StoredFolderListOptions): Promise<StoredFolderListResult> {
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
        return { items: docs.map(toFolder), total };
    }
}

function toFolder(doc: StoredFolderDocument): StoredFolder {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
