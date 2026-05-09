/**
 * Load the Key Encryption Key (KEK) from the environment.
 *
 * The KEK encrypts every per-bucket Data Encryption Key (DEK) before it
 * lands in Mongo. It is the only secret in the chain that must NEVER be
 * persisted: it lives in the cdn-buckets process env and nowhere else.
 * Generate one with `openssl rand -base64 32` (32 raw bytes → 44 chars b64).
 *
 * Format: base64-encoded, decodes to exactly 32 bytes (AES-256). Anything
 * else is a fail-fast at boot — silently using the wrong key length would
 * either break decryption later (good case) or downgrade to AES-128 (bad
 * case), so we refuse upfront.
 */
const REQUIRED_BYTES = 32;

export function loadKek(envValue: string | undefined): Buffer {
    if (!envValue || envValue.length === 0) {
        throw new Error("CDN_BUCKETS_KEK is missing — generate one with `openssl rand -base64 32`.");
    }
    let decoded: Buffer;
    try {
        decoded = Buffer.from(envValue, "base64");
    } catch {
        throw new Error("CDN_BUCKETS_KEK is not valid base64.");
    }
    if (decoded.length !== REQUIRED_BYTES) {
        throw new Error(`CDN_BUCKETS_KEK must decode to ${REQUIRED_BYTES} bytes (got ${decoded.length}).`);
    }
    return decoded;
}
