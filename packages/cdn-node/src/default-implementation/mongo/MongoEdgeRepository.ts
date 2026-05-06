import type { Collection, IndexDescription } from "mongodb";

import type { Edge } from "../../interfaces/entities/Edge";
import type { EdgeRepository, EdgeProbeResult } from "../../interfaces/repositories/EdgeRepository";

/** Mongo doc shape — `id` becomes `_id`. */
export type EdgeDocument = Omit<Edge, "id"> & { _id: string };

/**
 * MongoDB-backed `EdgeRepository`. The `_id` is the operator-chosen
 * `id`, which already gives uniqueness; no extra indexes needed at our
 * scale (an origin has O(10) edges).
 */
export class MongoEdgeRepository implements EdgeRepository {

    private readonly _collection: Collection<EdgeDocument>;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<EdgeDocument>, config: { createIndexes?: boolean } = {}) {
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
            { key: { addedAt: 1 }, name: "addedAt_asc" },
        ];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async list(): Promise<Edge[]> {
        await this._ready();
        const docs = await this._collection.find({}).sort({ addedAt: 1 }).toArray();
        return docs.map(toEdge);
    }

    async get(id: string): Promise<Edge | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: id });
        return doc ? toEdge(doc) : null;
    }

    async create(edge: Edge): Promise<void> {
        await this._ready();
        const { id, ...rest } = edge;
        await this._collection.insertOne({ _id: id, ...rest });
    }

    async update(id: string, patch: Partial<Pick<Edge,
        "label" | "hostname" | "sshUser" | "sshPort" | "dataPath" | "notes"
    >>): Promise<void> {
        await this._ready();
        if (Object.keys(patch).length === 0) return;
        await this._collection.updateOne({ _id: id }, { $set: patch });
    }

    async recordProbe(id: string, result: EdgeProbeResult): Promise<void> {
        await this._ready();
        const now = Date.now();
        const set: Partial<EdgeDocument> = {
            lastProbeAt:         now,
            lastProbeOk:         result.ok,
            lastProbeError:      result.error,
            lastProbeUsedBytes:  result.usedBytes,
            lastProbeFileCount:  result.fileCount,
            lastProbeHttpOk:     result.httpOk,
            lastProbeHttpStatus: result.httpStatus,
            lastProbeHttpError:  result.httpError,
        };
        if (result.ok || result.httpOk) set.lastSeenAt = now;
        await this._collection.updateOne({ _id: id }, { $set: set });
    }

    async delete(id: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ _id: id });
    }
}

function toEdge(doc: EdgeDocument): Edge {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}
