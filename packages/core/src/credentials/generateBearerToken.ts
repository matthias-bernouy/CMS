import { randomBase64Url } from "../utilities/crypto";

/**
 * Generates a cleartext bearer token. The `prefix` (e.g. "bsp_", "mtc_") is
 * grep-friendly in logs and lets ops tell at a glance what kind of token
 * leaked. 32 random bytes give ~256 bits of entropy.
 *
 * The cleartext is returned to the caller exactly once. The caller is
 * expected to immediately persist `sha256Hex(token)` and surface the
 * cleartext to the human/system that requested the credential.
 */
export function generateBearerToken(prefix: string): string {
    return prefix + randomBase64Url(32);
}
