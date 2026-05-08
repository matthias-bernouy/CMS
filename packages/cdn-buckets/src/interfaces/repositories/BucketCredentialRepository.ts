import type { CredentialRepository } from "@bernouy/core";
import type { BucketCredential } from "../entities/BucketCredential";

/**
 * Persistence contract for bucket-scoped bearer credentials. Inherits the
 * generic CRUD + `getByTokenHash` from core, adds bucket-cascade helpers.
 */
export interface BucketCredentialRepository extends CredentialRepository<BucketCredential> {
    listByBucket(bucketId: string): Promise<BucketCredential[]>;
    /** Bulk delete used by bucket cascade. Returns the row count removed. */
    deleteByBucket(bucketId: string): Promise<number>;
}
