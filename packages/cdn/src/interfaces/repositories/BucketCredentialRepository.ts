import type { BucketCredential } from "../entities/BucketCredential";

export interface BucketCredentialRepository {
    create(credential: BucketCredential): Promise<void>;
    get(id: string): Promise<BucketCredential | null>;
    /** Hot path for broker→provider auth. Caller has already hashed the bearer token. */
    getByTokenHash(tokenHash: string): Promise<BucketCredential | null>;
    listByBucket(bucketId: string): Promise<BucketCredential[]>;
    update(id: string, patch: Partial<Pick<BucketCredential, "label" | "expiresAt" | "revokedAt">>): Promise<void>;
    delete(id: string): Promise<void>;
    /** Bulk delete used by bucket cascade. Returns the row count removed. */
    deleteByBucket(bucketId: string): Promise<number>;
}
