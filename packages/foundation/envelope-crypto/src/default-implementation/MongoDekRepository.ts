import type { Collection, IndexDescription } from "mongodb";

import type { DekRepository, DekRecord } from "envelope-crypto/interfaces/DekRepository";

/**
 * Mongo doc shape for a per-scope DEK record. `_id` carries the scope
 * identifier (in a multi-tenant setup: a tenantId). `wrapped` is
 * provider-opaque — for `LocalKekProvider` a base64-of-IV+ciphertext
 * blob, for `OvhOkmsKekProvider` the JWE token returned by OVH.
 */
export type CmsDekDocument = {
    _id: string;
    wrapped: string;
    createdAt: Date;
    rotatedAt: Date | null;
};

/**
 * Generic MongoDB-backed `DekRepository`. A multi-tenant consumer mounts a single
 * instance of this on a shared `cms_deks` collection (no per-tenant
 * prefix) — DEK isolation across tenants comes from distinct scopeIds,
 * not distinct collections, so a single DEK cache (inside
 * `EnvelopeSecretCrypto`) serves the whole platform.
 */
export class MongoDekRepository implements DekRepository {
    private readonly _collection: Collection<CmsDekDocument>;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<CmsDekDocument>, config: { createIndexes?: boolean } = {}) {
        this._collection = collection;
        this._indexesReadyPromise =
            config.createIndexes === false
                ? null
                : this._ensureIndexes().catch((e) => {
                      this._indexesReadyPromise = null;
                      throw e;
                  });
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [{ key: { createdAt: -1 }, name: "createdAt" }];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) {
            await this._indexesReadyPromise;
        }
    }

    async get(scopeId: string): Promise<DekRecord | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: scopeId });
        if (!doc) {
            return null;
        }
        return {
            scopeId: doc._id,
            wrapped: doc.wrapped,
            createdAt: doc.createdAt,
            rotatedAt: doc.rotatedAt,
        };
    }

    async create(record: DekRecord): Promise<DekRecord> {
        await this._ready();
        // `$setOnInsert` + upsert = atomic insert-if-absent; a concurrent
        // writer's row is returned untouched instead of being overwritten.
        const winner = await this._collection.findOneAndUpdate(
            { _id: record.scopeId },
            {
                $setOnInsert: {
                    wrapped: record.wrapped,
                    createdAt: record.createdAt,
                    rotatedAt: record.rotatedAt,
                },
            },
            { upsert: true, returnDocument: "after" },
        );
        if (!winner) {
            throw new Error(`MongoDekRepository: create("${record.scopeId}") returned no document.`);
        }
        return {
            scopeId: winner._id,
            wrapped: winner.wrapped,
            createdAt: winner.createdAt,
            rotatedAt: winner.rotatedAt,
        };
    }

    async delete(scopeId: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ _id: scopeId });
    }
}
