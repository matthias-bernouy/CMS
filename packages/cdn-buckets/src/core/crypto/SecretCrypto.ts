// Backward-compat re-export. The interface now lives in `@bernouy/core`
// with generic `encrypt(scopeId)` / `decrypt(scopeId)` methods (replacing
// the legacy `encryptForBucket` / `decryptForBucket` shape).
export type { SecretCrypto } from "@bernouy/core";
