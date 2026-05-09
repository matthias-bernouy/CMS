/**
 * Per-bucket Data Encryption Key, stored only in its KEK-encrypted form.
 *
 * The plaintext DEK never leaves cdn-buckets memory: it is decrypted
 * with the process KEK at use-time (and cached briefly), used to wrap /
 * unwrap user secrets that belong to the bucket, and discarded.
 *
 * One-to-one with `Bucket` — created lazily on first secret write,
 * destroyed by the bucket-delete cascade. `rotatedAt` is reserved for a
 * future rotation flow; null on freshly created DEKs.
 */
export type BucketDek = {
    bucketId:     string;
    encryptedDek: Buffer;
    iv:           Buffer;
    createdAt:    Date;
    rotatedAt:    Date | null;
};
