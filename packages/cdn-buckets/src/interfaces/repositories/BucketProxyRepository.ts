import type { BucketProxy } from "../entities/BucketProxy";

/**
 * Persistence contract for bucket-attached proxy rules. The key is the
 * composite `(bucketId, providerId)` — at most one rule per provider id
 * per bucket. The repo's surface is plaintext-only; the Mongo impl
 * encrypts/decrypts secrets at the boundary against the bucket's DEK.
 */
export interface BucketProxyRepository {
    get(bucketId: string, providerId: string): Promise<BucketProxy | null>;
    list(bucketId: string): Promise<BucketProxy[]>;
    /** Used by the Nginx fragment regenerator — needs every proxy in one shot. */
    listAll(): Promise<BucketProxy[]>;
    upsert(proxy: BucketProxy): Promise<void>;
    delete(bucketId: string, providerId: string): Promise<void>;
    /** Bulk delete used by bucket cascade. Returns the row count removed. */
    deleteByBucket(bucketId: string): Promise<number>;
}
