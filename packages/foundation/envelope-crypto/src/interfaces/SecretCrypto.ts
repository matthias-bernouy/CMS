import type { EncryptedBlob } from "envelope-crypto/core/aesGcm";

/**
 * Per-scope secret encryption surface.
 *
 * A "scope" is any string identifier that segments DEKs (one DEK per
 * scope) — typically a tenantId, a bucketId, or "global" for
 * single-tenant deployments. Same scopeId at encrypt and decrypt time
 * is the consumer's responsibility — passing a different scopeId
 * mid-flight will throw at decrypt (DEK mismatch / GCM tag failure).
 */
export interface SecretCrypto {
    encrypt(scopeId: string, plaintext: string): Promise<EncryptedBlob>;
    decrypt(scopeId: string, blob: EncryptedBlob): Promise<string>;
}
