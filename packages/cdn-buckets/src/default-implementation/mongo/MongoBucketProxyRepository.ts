import type { Collection, IndexDescription } from "mongodb";
import type { SecretCrypto } from "@bernouy/core";

import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import type { BucketProxyRepository } from "../../interfaces/repositories/BucketProxyRepository";
import type { RulesConfig } from "../../interfaces/proxy/RulesConfig";

type EncryptedBlobDoc = { ciphertext: Buffer; iv: Buffer };

export type BucketProxyDocument = {
    bucketId:   string;
    providerId: string;
    server:     string;
    rules:      RulesConfig;
    /** envName → encrypted blob. The plaintext is wrapped with the
     *  bucket's DEK; the doc never contains a plaintext secret. */
    secrets:    Record<string, EncryptedBlobDoc>;
    createdAt:  Date;
    updatedAt:  Date;
};

/**
 * MongoDB-backed `BucketProxyRepository`. Composite uniqueness on
 * `(bucketId, providerId)` is enforced by a unique compound index — the
 * doc itself uses Mongo's auto-generated `_id`. The `rules` config is
 * persisted in plaintext (it carries no secrets, only references via
 * `${env:NAME}`); the actual secret values in `secrets` are encrypted
 * per-key via the bucket's DEK.
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
        const secrets = await this._encryptSecrets(proxy.bucketId, proxy.secrets);
        await this._collection.replaceOne(
            { bucketId: proxy.bucketId, providerId: proxy.providerId },
            {
                bucketId:   proxy.bucketId,
                providerId: proxy.providerId,
                server:     proxy.server,
                rules:      proxy.rules,
                secrets,
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

    private async _encryptSecrets(bucketId: string, plain: Record<string, string>): Promise<Record<string, EncryptedBlobDoc>> {
        const out: Record<string, EncryptedBlobDoc> = {};
        for (const [k, v] of Object.entries(plain)) {
            const blob = await this._crypto.encrypt(bucketId, v);
            out[k] = { ciphertext: blob.ciphertext, iv: blob.iv };
        }
        return out;
    }

    private async _toEntity(doc: BucketProxyDocument): Promise<BucketProxy> {
        const secrets: Record<string, string> = {};
        for (const [k, blob] of Object.entries(doc.secrets ?? {})) {
            secrets[k] = await this._crypto.decrypt(doc.bucketId, {
                ciphertext: asBuffer(blob.ciphertext),
                iv:         asBuffer(blob.iv),
            });
        }
        return {
            bucketId:   doc.bucketId,
            providerId: doc.providerId,
            server:     doc.server,
            rules:      doc.rules,
            secrets,
            createdAt:  doc.createdAt,
            updatedAt:  doc.updatedAt,
        };
    }
}

/** mongodb returns BSON `Binary` for stored Buffers; normalize at the boundary. */
function asBuffer(v: Buffer | { buffer: Buffer }): Buffer {
    return Buffer.isBuffer(v) ? v : Buffer.from(v.buffer);
}
