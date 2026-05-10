import type { Collection, IndexDescription } from "mongodb";

import type { DekRepository, DekRecord } from "@bernouy/core";
import { serializeBlob } from "@bernouy/core";

/**
 * On-disk shape. Two variants coexist for backward compat:
 *  - **New**: `{ _id, wrapped, createdAt, rotatedAt }` — a single
 *    provider-opaque `wrapped` string. All new writes use this shape.
 *  - **Legacy**: `{ _id, encryptedDek: Buffer, iv: Buffer, createdAt,
 *    rotatedAt }` — the original cdn-buckets shape, predating the
 *    `KekProvider` abstraction. Read transparently and converted on the
 *    fly via `serializeBlob`. Eventually rewritten to the new shape on
 *    the next `upsert` for the same scope.
 *
 * `_id` carries the scope identifier (in cdn-buckets' usage: a `bucketId`).
 */
export type BucketDekDocument = {
    _id:           string;
    wrapped?:      string;
    encryptedDek?: Buffer | { buffer: Buffer };
    iv?:           Buffer | { buffer: Buffer };
    createdAt:     Date;
    rotatedAt:     Date | null;
};

/**
 * MongoDB-backed `DekRepository` for cdn-buckets' per-bucket DEKs. The
 * `_id` is the scope (bucket) id, which natively enforces uniqueness —
 * `_ensureIndexes` only adds the `createdAt` secondary index used for
 * ops dashboards (audit "DEKs created in the last 24h", etc).
 */
export class MongoBucketDekRepository implements DekRepository {

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

    async get(scopeId: string): Promise<DekRecord | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: scopeId });
        return doc ? toDekRecord(doc) : null;
    }

    async upsert(record: DekRecord): Promise<void> {
        await this._ready();
        const doc: Omit<BucketDekDocument, "_id"> = {
            wrapped:   record.wrapped,
            createdAt: record.createdAt,
            rotatedAt: record.rotatedAt,
        };
        // Replace the whole doc so legacy `encryptedDek` / `iv` fields
        // (if present) are dropped on rewrite.
        await this._collection.replaceOne({ _id: record.scopeId }, doc, { upsert: true });
    }

    async delete(scopeId: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ _id: scopeId });
    }
}

function toDekRecord(doc: BucketDekDocument): DekRecord {
    if (typeof doc.wrapped === "string") {
        return {
            scopeId:   doc._id,
            wrapped:   doc.wrapped,
            createdAt: doc.createdAt,
            rotatedAt: doc.rotatedAt,
        };
    }
    if (doc.encryptedDek && doc.iv) {
        // Legacy shape — synthesize a wrapped string from the two binary
        // fields so the consumer (LocalKekProvider) can unwrap uniformly.
        const wrapped = serializeBlob({
            ciphertext: asBuffer(doc.encryptedDek),
            iv:         asBuffer(doc.iv),
        });
        return {
            scopeId:   doc._id,
            wrapped,
            createdAt: doc.createdAt,
            rotatedAt: doc.rotatedAt,
        };
    }
    throw new Error(`MongoBucketDekRepository: doc "${doc._id}" has neither 'wrapped' nor legacy 'encryptedDek/iv'.`);
}

function asBuffer(v: Buffer | { buffer: Buffer }): Buffer {
    if (Buffer.isBuffer(v)) return v;
    return Buffer.from(v.buffer);
}
