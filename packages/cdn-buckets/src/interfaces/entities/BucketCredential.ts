import type { Credential } from "@bernouy/core";

/**
 * Bucket-scoped bearer credential — a `Credential` extended with the
 * `bucketId` it grants access to. Several credentials per bucket are
 * allowed (rotation, dev/prod separation). The cleartext is returned
 * exactly once at creation; only `tokenHash` is persisted.
 */
export type BucketCredential = Credential & {
    bucketId: string;
};
