import type { BucketDek } from "../entities/BucketDek";

/**
 * Persistence contract for per-bucket DEKs. The `bucketId` is the
 * primary key — at most one DEK record per bucket at any time.
 */
export interface BucketDekRepository {
    get(bucketId: string): Promise<BucketDek | null>;
    upsert(dek: BucketDek): Promise<void>;
    delete(bucketId: string): Promise<void>;
}
