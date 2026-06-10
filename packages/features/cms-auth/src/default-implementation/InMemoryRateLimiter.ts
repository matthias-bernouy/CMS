import type { RateLimiter, RateLimitResult, RateLimitPolicy } from "cms-auth/interfaces/RateLimiter";

/**
 * In-memory fixed-window `RateLimiter` for dev / single-node. State is a
 * per-key `{ count, resetAt }`; only protects ONE process (no shared state
 * across a horizontally-scaled deployment — use `MongoRateLimiter` there).
 * Expired windows are recreated lazily on the next `hit`.
 */
export class InMemoryRateLimiter implements RateLimiter {

    private _windows = new Map<string, { count: number; resetAt: number }>();

    constructor(private readonly policy: RateLimitPolicy) {}

    async hit(key: string): Promise<RateLimitResult> {
        const now = Date.now();
        const w = this._windows.get(key);
        if (!w || now >= w.resetAt) {
            this._windows.set(key, { count: 1, resetAt: now + this.policy.windowSeconds * 1000 });
            return { allowed: true };
        }
        w.count++;
        if (w.count <= this.policy.limit) return { allowed: true };
        return { allowed: false, retryAfterSeconds: Math.ceil((w.resetAt - now) / 1000) };
    }

    async reset(key: string): Promise<void> {
        this._windows.delete(key);
    }
}
