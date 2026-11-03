import { randomUUIDv7 } from "bun";
import type { Collection, Db } from "mongodb";
import type {
    PatRepository,
    Pat,
    PatPrincipal,
    NewPat,
} from "cms-auth/tokens/personal-access/interfaces/PatRepository";
import { mintPatToken, hashPatToken } from "cms-auth/tokens/personal-access/core/patToken";
import { MAX_PERSONAL_ACCESS_TOKENS, PersonalAccessTokenLimitError } from "cms-auth/tokens/personal-access/core/limits";

export type MongoPatConfig = { collectionPrefix?: string };
type StoredPat = Omit<Pat, "sub"> & { hash: string };
type PatAccount = { _id: string; tokens: StoredPat[] };

/** One bounded document per account; the array-length predicate makes creation quotas atomic. */
export class MongoPatRepository implements PatRepository {
    private readonly collection: Collection<PatAccount>;
    constructor(db: Db, config: MongoPatConfig = {}) {
        this.collection = db.collection(`${config.collectionPrefix ?? ""}personal_access_tokens`);
    }

    async init(): Promise<void> {
        await this.collection.createIndex({ "tokens.hash": 1 }, { unique: true, sparse: true });
    }

    async create(input: NewPat): Promise<{ token: string; pat: Pat }> {
        const token = mintPatToken();
        const record: StoredPat = {
            id: randomUUIDv7(),
            hash: hashPatToken(token),
            name: input.name,
            createdAt: new Date(),
            expiresAt: input.expiresAt ?? null,
        };
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await this.collection.updateOne(
                    { _id: input.sub, [`tokens.${MAX_PERSONAL_ACCESS_TOKENS - 1}`]: { $exists: false } },
                    { $push: { tokens: record } },
                    { upsert: true },
                );
                return { token, pat: project(input.sub, record) };
            } catch (error) {
                if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) {
                    throw error;
                }
                const full = await this.collection.countDocuments(
                    { _id: input.sub, [`tokens.${MAX_PERSONAL_ACCESS_TOKENS - 1}`]: { $exists: true } },
                    { limit: 1 },
                );
                if (full) {
                    throw new PersonalAccessTokenLimitError();
                }
                if (attempt === 2) {
                    throw error;
                }
                // Concurrent first creation may race the unique account key; retry the atomic append.
            }
        }
        throw new Error("Token creation did not complete");
    }

    async verify(token: string): Promise<PatPrincipal | null> {
        const hash = hashPatToken(token);
        const now = new Date();
        const account = await this.collection.findOneAndUpdate(
            { tokens: { $elemMatch: { hash, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] } } },
            { $set: { "tokens.$.lastUsedAt": now } },
            { returnDocument: "after" },
        );
        return account ? { sub: account._id } : null;
    }

    async list(sub: string): Promise<Pat[]> {
        const account = await this.collection.findOne({ _id: sub });
        return (account?.tokens ?? []).map((record) => project(sub, record));
    }

    async revoke(sub: string, id: string): Promise<boolean> {
        const previous = await this.collection.findOneAndUpdate(
            { _id: sub, "tokens.id": id },
            { $pull: { tokens: { id } } },
            { returnDocument: "before" },
        );
        if (previous?.tokens.length === 1) {
            await this.collection.deleteOne({ _id: sub, tokens: { $size: 0 } });
        }
        return Boolean(previous);
    }
}

function project(sub: string, record: StoredPat): Pat {
    const { hash: _hash, ...metadata } = record;
    return { ...metadata, sub };
}
