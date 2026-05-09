import type { Collection, IndexDescription } from "mongodb";

import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import type { BucketProxyRepository } from "../../interfaces/repositories/BucketProxyRepository";
import type { SecretCrypto } from "../../core/crypto/SecretCrypto";
import { encryptProxyAuth, decryptProxyAuth, type ProxyAuthDoc } from "../../core/proxy/proxyAuthCrypto";

export type BucketProxyDocument = {
    bucketId:   string;
    providerId: string;
    server:     string;
    auth:       ProxyAuthDoc;
    createdAt:  Date;
    updatedAt:  Date;
};

/**
 * MongoDB-backed `BucketProxyRepository`. Composite uniqueness on
 * `(bucketId, providerId)` is enforced by a unique compound index — the
 * doc itself uses Mongo's auto-generated `_id`. Secrets in `auth` never
 * land in Mongo as plaintext: every read/write goes through `SecretCrypto`.
 */
export class MongoBucketProxyRepository implements BucketProxyRepository {

    private readonly _collection: Collection<BucketProxyDocument>;
    private readonly _crypto:     SecretCrypto;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(collection: Collection<BucketProxyDocument>, crypto: SecretCrypto, config: { createIndexes?: boolean } = {}) {
        this._collection = collection;
        this._crypto     = crypto;
        this._indexesReadyPromise = config.createIndexes === false
            ? null
            : this._ensureIndexes().catch((e) => { this._indexesReadyPromise = null; throw e; });
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [
            { key: { bucketId: 1, providerId: 1 }, unique: true, name: "bucket_provider_unique" },
            { key: { bucketId: 1, createdAt: -1 },               name: "bucket_createdAt"        },
        ];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async get(bucketId: string, providerId: string): Promise<BucketProxy | null> {
        await this._ready();
        const doc = await this._collection.findOne({ bucketId, providerId });
        return doc ? this._toEntity(doc) : null;
    }

    async list(bucketId: string): Promise<BucketProxy[]> {
        await this._ready();
        const docs = await this._collection.find({ bucketId }).sort({ createdAt: -1 }).toArray();
        return Promise.all(docs.map((d) => this._toEntity(d)));
    }

    async listAll(): Promise<BucketProxy[]> {
        await this._ready();
        const docs = await this._collection.find({}).sort({ bucketId: 1, providerId: 1 }).toArray();
        return Promise.all(docs.map((d) => this._toEntity(d)));
    }

    async upsert(proxy: BucketProxy): Promise<void> {
        await this._ready();
        const auth = await encryptProxyAuth(proxy.bucketId, proxy.auth, this._crypto);
        await this._collection.replaceOne(
            { bucketId: proxy.bucketId, providerId: proxy.providerId },
            {
                bucketId:   proxy.bucketId,
                providerId: proxy.providerId,
                server:     proxy.server,
                auth,
                createdAt:  proxy.createdAt,
                updatedAt:  proxy.updatedAt,
            },
            { upsert: true },
        );
    }

    async delete(bucketId: string, providerId: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ bucketId, providerId });
    }

    async deleteByBucket(bucketId: string): Promise<number> {
        await this._ready();
        const result = await this._collection.deleteMany({ bucketId });
        return result.deletedCount ?? 0;
    }

    private async _toEntity(doc: BucketProxyDocument): Promise<BucketProxy> {
        const auth = await decryptProxyAuth(doc.bucketId, doc.auth, this._crypto);
        return {
            bucketId:   doc.bucketId,
            providerId: doc.providerId,
            server:     doc.server,
            auth,
            createdAt:  doc.createdAt,
            updatedAt:  doc.updatedAt,
        };
    }
}
