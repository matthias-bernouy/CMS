import type { PreSignedToken } from "../entities/PreSignedToken";

export interface PreSignedTokenRepository {
    create(token: PreSignedToken): Promise<void>;
    get(id: string): Promise<PreSignedToken | null>;
    /**
     * Atomic single-use enforcement. Returns the token on the *first* successful
     * call (and only then); subsequent calls return `null`. Implementations MUST
     * make this a single round-trip (e.g. SQL `UPDATE … WHERE consumedAt IS NULL
     * RETURNING *`) to avoid TOCTOU races.
     */
    tryConsume(id: string): Promise<PreSignedToken | null>;
    /** Cleanup hook for a periodic task. Returns the number of rows removed. */
    deleteExpired(): Promise<number>;
    /** Bulk delete used by bucket cascade. Returns the row count removed. */
    deleteByBucket(bucketId: string): Promise<number>;
}
