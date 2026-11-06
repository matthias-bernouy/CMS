import type { Collection, Db } from "mongodb";
import type { SessionRecord, SessionRepository } from "cms-auth/sessions/interfaces/SessionRepository";
import { MAX_ACCOUNT_SESSIONS, SESSION_ABSOLUTE_TIMEOUT_SECONDS } from "cms-auth/sessions/core/sessionPolicy";

type StoredSession = Omit<SessionRecord, "sub">;
type SessionAccount = { _id: string; sessions: StoredSession[]; invalidatedBefore: Date; expiresAt: Date };

/** One bounded document per account. Indexed lookup/touch is one atomic operation. */
export class MongoSessionRepository implements SessionRepository {
    private readonly collection: Collection<SessionAccount>;

    constructor(db: Db, config: { collectionPrefix?: string } = {}) {
        this.collection = db.collection(`${config.collectionPrefix ?? ""}sessions`);
    }

    async init(): Promise<void> {
        await this.collection.createIndex({ "sessions.tokenHash": 1 }, { unique: true, sparse: true });
        await this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }

    async create(session: SessionRecord, authenticatedAt: Date): Promise<boolean> {
        const { sub, ...stored } = session;
        await this.ensureAccount(sub, session.absoluteExpiresAt);
        const result = await this.collection.updateOne({ _id: sub, invalidatedBefore: { $lt: authenticatedAt } }, [
            {
                $set: {
                    sessions: {
                        $slice: [
                            {
                                $concatArrays: [
                                    {
                                        $filter: {
                                            input: "$sessions",
                                            as: "session",
                                            cond: {
                                                $and: [
                                                    { $gt: ["$$session.idleExpiresAt", session.createdAt] },
                                                    { $gt: ["$$session.absoluteExpiresAt", session.createdAt] },
                                                ],
                                            },
                                        },
                                    },
                                    { $literal: [stored] },
                                ],
                            },
                            -MAX_ACCOUNT_SESSIONS,
                        ],
                    },
                },
            },
            { $set: { expiresAt: { $max: ["$expiresAt", session.absoluteExpiresAt] } } },
        ]);
        return result.matchedCount === 1;
    }

    async touch(tokenHash: string, now: Date, idleTimeoutMs: number): Promise<SessionRecord | null> {
        const account = await this.collection.findOneAndUpdate(
            {
                invalidatedBefore: { $type: "date" },
                expiresAt: { $type: "date" },
                sessions: {
                    $elemMatch: {
                        tokenHash,
                        createdAt: { $type: "date" },
                        lastActivityAt: { $type: "date" },
                        idleExpiresAt: { $gt: now },
                        absoluteExpiresAt: { $gt: now },
                    },
                },
            },
            {
                $max: {
                    "sessions.$.lastActivityAt": now,
                    "sessions.$.idleExpiresAt": new Date(now.getTime() + idleTimeoutMs),
                },
            },
            { returnDocument: "after", projection: { sessions: { $elemMatch: { tokenHash } } } },
        );
        return account?.sessions[0] ? { ...account.sessions[0], sub: account._id } : null;
    }

    async revoke(tokenHash: string): Promise<void> {
        await this.collection.updateOne({ "sessions.tokenHash": tokenHash }, { $pull: { sessions: { tokenHash } } });
    }

    async revokeForSub(sub: string, now: Date): Promise<void> {
        const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_SECONDS * 1000);
        await this.ensureAccount(sub, expiresAt);
        await this.collection.updateOne(
            { _id: sub },
            {
                $set: { sessions: [] },
                $max: { invalidatedBefore: now, expiresAt },
            },
        );
    }

    private async ensureAccount(sub: string, expiresAt: Date): Promise<void> {
        try {
            const account = await this.collection.findOneAndUpdate(
                { _id: sub },
                { $setOnInsert: { sessions: [], invalidatedBefore: new Date(0), expiresAt } },
                { upsert: true, returnDocument: "after" },
            );
            assertAccount(account);
        } catch (error) {
            if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) {
                throw error;
            }
            assertAccount(await this.collection.findOne({ _id: sub }));
        }
    }
}

function assertAccount(account: SessionAccount | null): void {
    const validDate = (date: unknown): date is Date => date instanceof Date && Number.isFinite(date.getTime());
    if (
        !account ||
        !validDate(account.invalidatedBefore) ||
        !validDate(account.expiresAt) ||
        !Array.isArray(account.sessions) ||
        account.sessions.length > MAX_ACCOUNT_SESSIONS ||
        account.sessions.some(
            (session) =>
                !session ||
                !/^[a-f0-9]{64}$/u.test(session.tokenHash) ||
                !validDate(session.createdAt) ||
                !validDate(session.lastActivityAt) ||
                !validDate(session.idleExpiresAt) ||
                !validDate(session.absoluteExpiresAt),
        )
    ) {
        throw new TypeError("Stored session account is invalid");
    }
}
