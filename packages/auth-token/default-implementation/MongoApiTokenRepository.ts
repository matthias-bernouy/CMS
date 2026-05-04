import type { Collection, IndexDescription } from "mongodb";

import type { DefaultRole } from "@bernouy/core";
import type { ApiToken, ApiTokenRepository } from "../src/interfaces/ApiTokenRepository";

/**
 * Shape of the documents stored in MongoDB. Kept distinct from `ApiToken`
 * so that the storage schema can evolve independently of the public type
 * (and so we use `_id` as our `id`, Mongo's native key).
 */
export type ApiTokenDocument<Role extends string = DefaultRole> = {
    _id: string;
    ownerSub: string;
    ownerRole: Role;
    ownerDisplayName?: string;
    tokenHash: string;
    label: string;
    createdAt: Date;
    lastUsedAt?: Date;
    expiresAt?: Date;
    revokedAt?: Date;
};

export type MongoApiTokenRepositoryConfig = {
    /**
     * When `true`, creates the required indexes on the first use. Safe to
     * leave on (Mongo's `createIndexes` is idempotent). Disable only if
     * your deployment manages indexes out-of-band.
     */
    createIndexes?: boolean;
};

/**
 * MongoDB-backed `ApiTokenRepository`. The caller owns the `MongoClient`
 * lifecycle — pass an already-resolved `Collection<ApiTokenDocument>`.
 * This avoids coupling the consumer to connection management and lets the
 * app share a single client with other collections.
 */
export class MongoApiTokenRepository<Role extends string = DefaultRole>
    implements ApiTokenRepository<Role> {

    private readonly _collection: Collection<ApiTokenDocument<Role>>;
    private _indexesReadyPromise: Promise<void> | null = null;

    constructor(collection: Collection<ApiTokenDocument<Role>>, config: MongoApiTokenRepositoryConfig = {}) {
        this._collection = collection;
        if (config.createIndexes !== false) {
            this._indexesReadyPromise = this._ensureIndexes().catch((e) => {
                this._indexesReadyPromise = null;
                throw e;
            });
        }
    }

    private async _ensureIndexes(): Promise<void> {
        const indexes: IndexDescription[] = [
            { key: { tokenHash: 1 }, unique: true, name: "tokenHash_unique" },
            { key: { ownerSub: 1, createdAt: -1 }, name: "ownerSub_createdAt" },
            // TTL: Mongo deletes docs where `expiresAt` is past. `sparse`
            // keeps tokens without an expiration alive forever.
            { key: { expiresAt: 1 }, expireAfterSeconds: 0, sparse: true, name: "expiresAt_ttl" },
        ];
        await this._collection.createIndexes(indexes);
    }

    private async _ready(): Promise<void> {
        if (this._indexesReadyPromise) await this._indexesReadyPromise;
    }

    async findByHash(hash: string): Promise<ApiToken<Role> | null> {
        await this._ready();
        const doc = await this._collection.findOne({ tokenHash: hash });
        return doc ? toApiToken(doc) : null;
    }

    async findByOwner(sub: string): Promise<ApiToken<Role>[]> {
        await this._ready();
        const docs = await this._collection
            .find({ ownerSub: sub })
            .sort({ createdAt: -1 })
            .toArray();
        return docs.map(toApiToken);
    }

    async countActiveByOwner(sub: string): Promise<number> {
        await this._ready();
        const now = new Date();
        return this._collection.countDocuments({
            ownerSub: sub,
            revokedAt: { $exists: false },
            $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
        });
    }

    async create(data: Omit<ApiToken<Role>, "id" | "createdAt">): Promise<ApiToken<Role>> {
        await this._ready();
        const doc: ApiTokenDocument<Role> = {
            _id: crypto.randomUUID(),
            ownerSub: data.ownerSub,
            ownerRole: data.ownerRole,
            tokenHash: data.tokenHash,
            label: data.label,
            createdAt: new Date(),
            ...(data.ownerDisplayName !== undefined ? { ownerDisplayName: data.ownerDisplayName } : {}),
            ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
            ...(data.lastUsedAt !== undefined ? { lastUsedAt: data.lastUsedAt } : {}),
            ...(data.revokedAt !== undefined ? { revokedAt: data.revokedAt } : {}),
        };
        await this._collection.insertOne(doc);
        return toApiToken(doc);
    }

    async revoke(id: string, ownerSub: string): Promise<boolean> {
        await this._ready();
        const result = await this._collection.updateOne(
            { _id: id, ownerSub, revokedAt: { $exists: false } },
            { $set: { revokedAt: new Date() } },
        );
        return result.modifiedCount === 1;
    }

    async touchLastUsed(id: string): Promise<void> {
        await this._ready();
        await this._collection.updateOne({ _id: id }, { $set: { lastUsedAt: new Date() } });
    }
}

function toApiToken<Role extends string>(doc: ApiTokenDocument<Role>): ApiToken<Role> {
    return {
        id: doc._id,
        ownerSub: doc.ownerSub,
        ownerRole: doc.ownerRole,
        ownerDisplayName: doc.ownerDisplayName,
        tokenHash: doc.tokenHash,
        label: doc.label,
        createdAt: doc.createdAt,
        lastUsedAt: doc.lastUsedAt,
        expiresAt: doc.expiresAt,
        revokedAt: doc.revokedAt,
    };
}
