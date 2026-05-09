import type { EncryptedBlob } from "./encrypt";

/**
 * Per-bucket secret encryption surface consumed by repositories that
 * persist user-supplied tokens (currently `BucketProxy.auth`). Hides the
 * envelope-encryption details (KEK, DEK lookup, caching) — repos call
 * `encryptForBucket` / `decryptForBucket` and don't see keys.
 *
 * Implementations must guarantee: distinct calls produce distinct IVs,
 * even for identical plaintexts, and decryption fails (throws) when the
 * GCM tag doesn't validate.
 */
export interface SecretCrypto {
    encryptForBucket(bucketId: string, plaintext: string): Promise<EncryptedBlob>;
    decryptForBucket(bucketId: string, blob: EncryptedBlob): Promise<string>;
}
