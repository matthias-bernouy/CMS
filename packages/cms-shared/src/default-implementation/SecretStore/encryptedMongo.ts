import type { Collection, IndexDescription } from "mongodb";

import type { SecretCrypto } from "@bernouy/core";
import type { SecretStore } from "../../interfaces/SecretStore";

/**
 * Mongo doc shape for an encrypted secret value. `_id` is the secret
 * key (e.g. `STRIPE_KEY`); a separate field would force a compound
 * unique index for the same uniqueness guarantee. `ciphertext` includes
 * the AES-GCM auth tag.
 */
export type EncryptedSecretDocument = {
    _id:        string;
    ciphertext: Buffer;
    iv:         Buffer;
};

export type EncryptedMongoSecretStoreConfig = {
    /** DEK lookup scope. In a multi-tenant setup: the tenantId. */
    scopeId: string;
    /** Mongo collection holding encrypted secret docs. the consuming runtime
     *  uses one collection per tenant (typically
     *  `tenant_<id>__secrets`), so the docs are pre-isolated; the
     *  `scopeId` is only used for routing the DEK lookup. */
    collection: Collection<EncryptedSecretDocument>;
    /** Envelope-encryption surface — typically a single
     *  `EnvelopeSecretCrypto(kekProvider, dekRepo)` instance shared
     *  across the platform. */
    secretCrypto: SecretCrypto;
    /** Skip index creation (tests). */
    createIndexes?: boolean;
};

/**
 * MongoDB-backed `SecretStore` that envelope-encrypts every value
 * before persistence. Per-scope DEKs are wrapped by a process-level
 * KEK (the `SecretCrypto` config decides whether that's a local
 * AES-GCM KEK or an OVH OKMS Customer Managed Key).
 *
 * Unlike `InMemorySecretStore`, secrets survive container restarts —
 * and unlike a hypothetical `MongoSecretStore` (cleartext), a Mongo
 * dump alone is useless to an attacker without the KEK.
 */
export class EncryptedMongoSecretStore implements SecretStore {

    private readonly _scopeId:    string;
    private readonly _collection: Collection<EncryptedSecretDocument>;
    private readonly _crypto:     SecretCrypto;
    private _indexesReadyPromise: Promise<void> | null;

    constructor(config: EncryptedMongoSecretStoreConfig) {
        this._scopeId    = config.scopeId;
        this._collection = config.collection;
        this._crypto     = config.secretCrypto;
        this._indexesReadyPromise = config.createIndexes === false
            ? null
            : this._ensureIndexes().catch((e) => { this._indexesReadyPromise = null; throw e; });
    }

    private async _ensureIndexes(): Promise<void> {
        // `_id` is already unique by construction; no extra indexes needed.
        const indexes: IndexDescription[] = [];
        if (indexes.length > 0) await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async get(key: string): Promise<string | null> {
        await this._ready();
        const doc = await this._collection.findOne({ _id: key });
        if (!doc) return null;
        return this._crypto.decrypt(this._scopeId, {
            ciphertext: asBuffer(doc.ciphertext),
            iv:         asBuffer(doc.iv),
        });
    }

    async set(key: string, value: string): Promise<void> {
        await this._ready();
        const blob = await this._crypto.encrypt(this._scopeId, value);
        await this._collection.replaceOne(
            { _id: key },
            { ciphertext: blob.ciphertext, iv: blob.iv },
            { upsert: true },
        );
    }

    async delete(key: string): Promise<void> {
        await this._ready();
        await this._collection.deleteOne({ _id: key });
    }

    async list(): Promise<Array<{ key: string; value: string }>> {
        await this._ready();
        const docs = await this._collection.find({}).toArray();
        // Decrypt sequentially is fine — admin path, low fan-out.
        const out: Array<{ key: string; value: string }> = [];
        for (const doc of docs) {
            const value = await this._crypto.decrypt(this._scopeId, {
                ciphertext: asBuffer(doc.ciphertext),
                iv:         asBuffer(doc.iv),
            });
            out.push({ key: doc._id, value });
        }
        return out;
    }

    async listKeys(): Promise<string[]> {
        await this._ready();
        const docs = await this._collection.find({}, { projection: { _id: 1 } }).toArray();
        return docs.map((d) => d._id);
    }
}

/**
 * The mongodb driver returns BSON `Binary` for stored Buffers. The
 * shape exposes `.buffer` as a Buffer; normalize at the boundary so
 * `SecretCrypto.decrypt` always sees a plain Buffer.
 */
function asBuffer(v: Buffer | { buffer: Buffer }): Buffer {
    if (Buffer.isBuffer(v)) return v;
    return Buffer.from(v.buffer);
}
