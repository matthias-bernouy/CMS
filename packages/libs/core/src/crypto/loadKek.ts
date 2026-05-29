/**
 * Load a Key Encryption Key (KEK) from an environment value.
 *
 * Format: base64-encoded, decodes to exactly 32 bytes (AES-256). Anything
 * else is a fail-fast at boot — silently using the wrong key length would
 * either break decryption later (good case) or downgrade to AES-128 (bad
 * case), so we refuse upfront.
 *
 * Generate a fresh KEK with `openssl rand -base64 32` (44 chars b64).
 *
 * `envVarName` is used in error messages only — pass the env-var key
 * the consumer reads from (e.g. `CDN_BUCKETS_KEK`, `CMS_KEK`).
 */
const REQUIRED_BYTES = 32;

export function loadKek(envValue: string | undefined, envVarName: string = "KEK"): Buffer {
    if (!envValue || envValue.length === 0) {
        throw new Error(`${envVarName} is missing — generate one with \`openssl rand -base64 32\`.`);
    }
    let decoded: Buffer;
    try {
        decoded = Buffer.from(envValue, "base64");
    } catch {
        throw new Error(`${envVarName} is not valid base64.`);
    }
    if (decoded.length !== REQUIRED_BYTES) {
        throw new Error(`${envVarName} must decode to ${REQUIRED_BYTES} bytes (got ${decoded.length}).`);
    }
    return decoded;
}
