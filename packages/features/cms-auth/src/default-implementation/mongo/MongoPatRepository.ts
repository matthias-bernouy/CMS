import { randomUUIDv7 } from "bun";
import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { PatRepository, Pat, PatPrincipal, NewPat } from "cms-auth/interfaces/PatRepository";
import { mintPatToken, hashPatToken } from "cms-auth/core/patToken";

/**
 * MongoDB `PatRepository`. One collection (`<prefix>pats`), the record id as
 * `_id`, a unique index on the token `hash` so `verify` is a single lookup.
 * Only the SHA-256 of each token is stored (never the plaintext).
 * `collectionPrefix` isolates a tenant (same convention as `MongoCmsRepository`).
 * Call `init()` once at boot to create the unique hash index.
 */
export type MongoPatConfig = { collectionPrefix?: string };

type PatDoc = Omit<Pat, "id"> & { _id: string; hash: string };

export class MongoPatRepository implements PatRepository {

    private readonly _prefix: string;

    constructor(private readonly db: Db, config: MongoPatConfig = {}) {
        this._prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.col.createIndex({ hash: 1 }, { unique: true });
    }

    private get col(): Collection<PatDoc> {
        return this.db.collection<PatDoc>(this._prefix + "pats");
    }

    async create(input: NewPat): Promise<{ token: string; pat: Pat }> {
        const token = mintPatToken();
        const doc: PatDoc = {
            _id:       randomUUIDv7(),
            hash:      hashPatToken(token),
            sub:       input.sub,
            name:      input.name,
            scopes:    input.scopes ?? [],
            createdAt: new Date(),
            expiresAt: input.expiresAt ?? null,
        };
        await this.col.insertOne(doc as OptionalUnlessRequiredId<PatDoc>);
        return { token, pat: fromDoc(doc) };
    }

    async verify(token: string): Promise<PatPrincipal | null> {
        // Filter expiry IN the query so an expired (or unknown) token never
        // matches — no `lastUsedAt` write on a failed verification.
        const now = new Date();
        const doc = await this.col.findOneAndUpdate(
            { hash: hashPatToken(token), $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
            { $set: { lastUsedAt: now } },
            { returnDocument: "after" },
        );
        if (!doc) return null;
        return { sub: doc.sub, scopes: [...doc.scopes] };
    }

    async list(sub: string): Promise<Pat[]> {
        return (await this.col.find({ sub }).sort({ createdAt: 1 }).toArray()).map(fromDoc);
    }

    async revoke(sub: string, id: string): Promise<boolean> {
        const r = await this.col.deleteOne({ _id: id, sub });
        return r.deletedCount === 1;
    }
}

function fromDoc(d: PatDoc): Pat {
    const { _id, hash: _hash, ...rest } = d;
    return { id: _id, ...rest };
}
