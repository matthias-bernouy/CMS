/**
 * A fixed-window counter, keyed by an arbitrary string. Used to throttle
 * brute-force / credential-stuffing on the login path (keyed by email and by
 * IP) BEFORE the expensive argon2 verify runs, so it also caps CPU-DoS.
 *
 * `hit` records one attempt and reports whether it is still allowed; `reset`
 * clears a key (called on a successful login so a legitimate user's earlier
 * fumbles don't count against them).
 */
export type RateLimitResult = {
    allowed: boolean;
    /** Seconds until the window resets — only set when `allowed` is false. */
    retryAfterSeconds?: number;
};

/** Window policy: at most `limit` hits per rolling `windowSeconds`. */
export type RateLimitPolicy = { limit: number; windowSeconds: number };

export interface RateLimiter {
    hit(key: string): Promise<RateLimitResult>;
    reset(key: string): Promise<void>;
}
