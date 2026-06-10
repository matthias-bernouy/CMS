import type { Collection, Db } from "mongodb";
import type { RateLimiter, RateLimitResult, RateLimitPolicy } from "rate-limiter/interfaces/RateLimiter";

/**
 * MongoDB fixed-window `RateLimiter` — shared state across every node, which is
 * what a horizontally-scaled deployment needs (the in-memory impl only throttles
 * one process). One doc per key in `<prefix>rate_limits`, `key` as `_id`, with a
 * TTL index on `expiresAt` so spent windows are reaped automatically.
 *
 * Window boundaries are slightly racy under concurrency (two requests can both
 * open a fresh window and lose one increment) — acceptable for a throttle.
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
        // Increment within an ACTIVE window (expiresAt in the future).
        const active = await this.col.findOneAndUpdate(
            { _id: key, expiresAt: { $gt: now } },
            { $inc: { count: 1 } },
            { returnDocument: "after" },
        );
        if (active) {
            if (active.count <= this.policy.limit) return { allowed: true };
            return { allowed: false, retryAfterSeconds: Math.ceil((active.expiresAt.getTime() - now.getTime()) / 1000) };
        }
        // No active window (new key or expired) — open a fresh one.
        const expiresAt = new Date(now.getTime() + this.policy.windowSeconds * 1000);
        await this.col.updateOne({ _id: key }, { $set: { count: 1, expiresAt } }, { upsert: true });
        return { allowed: true };
    }

    async reset(key: string): Promise<void> {
        await this.col.deleteOne({ _id: key });
    }
}
