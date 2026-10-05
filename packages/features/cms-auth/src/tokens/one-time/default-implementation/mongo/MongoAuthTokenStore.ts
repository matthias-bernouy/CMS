import { randomUUIDv7 } from "bun";
import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type {
    AuthToken,
    AuthTokenPurpose,
    AuthTokenReservation,
    AuthTokenStore,
    NewAuthToken,
} from "cms-auth/tokens/one-time/interfaces/AuthTokenStore";
import { hashAuthToken, hashAuthTokenReservation, mintAuthToken } from "cms-auth/tokens/one-time/core/authToken";

export type MongoAuthTokenConfig = { collectionPrefix?: string };

type AuthTokenDoc = Omit<AuthToken, "id"> & {
    _id: string;
    hash: string;
    reservationDigest?: string;
    reservationId?: string;
    reservationExpiresAt?: Date;
};

const RESERVATION_MS = 5 * 60 * 1_000;

/**
 * MongoDB auth token store. Tokens are single-use and persisted as SHA-256
 * hashes only; the plaintext is returned once from `create`.
 */
export class MongoAuthTokenStore implements AuthTokenStore {
    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoAuthTokenConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.col.createIndex({ hash: 1 }, { unique: true });
        await this.col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await this.col.createIndex({ sub: 1, purpose: 1, consumedAt: 1 });
        await this.col.createIndex({ reservationExpiresAt: 1 });
    }

    private get col(): Collection<AuthTokenDoc> {
        return this.db.collection<AuthTokenDoc>(this._prefix + "auth_tokens");
    }

    async create(input: NewAuthToken): Promise<{ token: string; authToken: AuthToken }> {
        const token = mintAuthToken();
        const doc: AuthTokenDoc = {
            _id: randomUUIDv7(),
            hash: hashAuthToken(token),
            purpose: input.purpose,
            sub: input.sub,
            createdAt: new Date(),
            expiresAt: input.expiresAt,
            consumedAt: null,
        };
        await this.col.insertOne(doc as OptionalUnlessRequiredId<AuthTokenDoc>);
        return { token, authToken: fromDoc(doc) };
    }

    async findActive(purpose: AuthTokenPurpose, sub: string): Promise<AuthToken | null> {
        const doc = await this.col.findOne(
            { purpose, sub, consumedAt: null, expiresAt: { $gt: new Date() } },
            { sort: { createdAt: -1 } },
        );
        return doc ? fromDoc(doc) : null;
    }

    async consume(purpose: AuthTokenPurpose, token: string): Promise<AuthToken | null> {
        const reservation = await this.reserve(purpose, token, "compatibility-consume");
        return reservation ? this.finalize(reservation.id) : null;
    }

    async reserve(purpose: AuthTokenPurpose, token: string, operation: string): Promise<AuthTokenReservation | null> {
        const now = new Date();
        const reservationId = randomUUIDv7();
        const reservationExpiresAt = new Date(now.getTime() + RESERVATION_MS);
        const reservationDigest = hashAuthTokenReservation(token, purpose, operation);
        const doc = await this.col.findOneAndUpdate(
            {
                hash: hashAuthToken(token),
                purpose,
                consumedAt: null,
                expiresAt: { $gt: now },
                $and: [
                    {
                        $or: [{ reservationDigest: { $exists: false } }, { reservationDigest }],
                    },
                    {
                        $or: [{ reservationId: { $exists: false } }, { reservationExpiresAt: { $lte: now } }],
                    },
                ],
            },
            { $set: { reservationId, reservationExpiresAt, reservationDigest } },
            { returnDocument: "after" },
        );
        return doc ? { id: reservationId, authToken: fromDoc(doc), expiresAt: reservationExpiresAt } : null;
    }

    async finalize(reservationId: string): Promise<AuthToken | null> {
        const now = new Date();
        const doc = await this.col.findOneAndUpdate(
            { reservationId, reservationExpiresAt: { $gt: now }, consumedAt: null },
            {
                $set: { consumedAt: now },
                $unset: { reservationId: "", reservationExpiresAt: "", reservationDigest: "" },
            },
            { returnDocument: "after" },
        );
        return doc ? fromDoc(doc) : null;
    }

    async release(reservationId: string): Promise<boolean> {
        const result = await this.col.updateOne(
            { reservationId, consumedAt: null },
            { $unset: { reservationId: "", reservationExpiresAt: "" } },
        );
        return result.modifiedCount === 1;
    }

    async deleteForSub(sub: string, purpose?: AuthTokenPurpose): Promise<number> {
        const filter: { sub: string; purpose?: AuthTokenPurpose } = { sub };
        if (purpose) {
            filter.purpose = purpose;
        }
        const r = await this.col.deleteMany(filter);
        return r.deletedCount;
    }
}

function fromDoc(doc: AuthTokenDoc): AuthToken {
    const {
        _id,
        hash: _hash,
        reservationId: _reservationId,
        reservationExpiresAt: _reservationExpiresAt,
        reservationDigest: _reservationDigest,
        ...token
    } = doc;
    return { ...token, id: _id };
}
