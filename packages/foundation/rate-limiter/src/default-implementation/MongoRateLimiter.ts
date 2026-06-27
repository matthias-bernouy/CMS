import type { Collection, Db } from "mongodb";
import type { RateLimiter, RateLimitResult, RateLimitPolicy } from "rate-limiter/interfaces/RateLimiter";

/**
 * MongoDB fixed-window `RateLimiter` — shared state across every node, which is
 * what a horizontally-scaled deployment needs (the in-memory impl only throttles
 * one process). One doc per key in `<prefix>rate_limits`, `key` as `_id`, with a
 * TTL index on `expiresAt` so spent windows are reaped automatically.
 *
 * Window creation/reset is a single atomic update pipeline, so concurrent hits
 * cannot lose increments at a boundary.
 * Call `init()` once at boot to create the TTL index.
 */
export type MongoRateLimiterConfig = { collectionPrefix?: string };

type WindowDoc = { _id: string; count: number; expiresAt: Date };

export class MongoRateLimiter implements RateLimiter {

    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        private readonly policy: RateLimitPolicy,
        config: MongoRateLimiterConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }

    private get col(): Collection<WindowDoc> {
        return this.db.collection<WindowDoc>(this._prefix + "rate_limits");
    }

    async hit(key: string): Promise<RateLimitResult> {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.policy.windowSeconds * 1000);
        const updated = await this.col.findOneAndUpdate(
            { _id: key },
            [
                {
                    $set: {
                        count: {
                            $cond: [
                                { $gt: ["$expiresAt", now] },
                                { $add: [{ $ifNull: ["$count", 0] }, 1] },
                                1,
                            ],
                        },
                        expiresAt: {
                            $cond: [
                                { $gt: ["$expiresAt", now] },
                                "$expiresAt",
                                expiresAt,
                            ],
                        },
                    },
                },
            ],
            { upsert: true, returnDocument: "after" },
        );

        if (!updated) return { allowed: true };
        if (updated.count <= this.policy.limit) return { allowed: true };
        return {
            allowed: false,
            retryAfterSeconds: Math.ceil((updated.expiresAt.getTime() - now.getTime()) / 1000),
        };
    }

    async reset(key: string): Promise<void> {
        await this.col.deleteOne({ _id: key });
    }
}
