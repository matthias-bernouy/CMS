import type { SigningKey, PublishedKey } from "src/types/SigningKey";

/**
 * Pluggable key store (base.md §4.8). Default = `FileKeyStore` (encrypted
 * at rest); `MemoryKeyStore` for tests. The private key never
 * leaves the store except as the active `SigningKey` handed to the minter.
 *
 * Rotation is **publish-before-sign**: `rotate()` makes the new key
 * appear in `loadAll()` (→ JWKS) and only then becomes the `loadActive()`
 * signer; the old key stays published until `prune()` past the overlap.
 */
export interface KeyStore {
    /** Current signing key (kid + private CryptoKey). */
    loadActive(): Promise<SigningKey>;
    /** Every key to publish in the JWKS: active + still-overlapping retired. */
    loadAll(): Promise<PublishedKey[]>;
    /** Generate the next key, publish it, switch active, retire the old. */
    rotate(): Promise<void>;
    /** Drop keys whose `retiredAt` is older than the overlap window. */
    prune(nowSec: number): Promise<void>;
}
