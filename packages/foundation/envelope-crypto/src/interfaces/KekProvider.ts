/**
 * Abstraction over the master Key Encryption Key (KEK).
 *
 * The bundled `LocalKekRingProvider` uses an explicit key ring and wraps
 * DEKs locally with AES-GCM, without network I/O.
 *
 * The `wrapped` value is an opaque, provider-specific string. The local
 * provider encodes `<iv-b64>.<ciphertext-b64>`.
 * Storage layers MUST NOT inspect or split this string — round-trip it
 * untouched through the same provider that produced it.
 */
export interface KekProvider {
    /** Stable identifier written next to every newly wrapped DEK. */
    readonly activeKeyId: string;

    /**
     * Generate a fresh 32-byte DEK. Returns the plaintext (use immediately
     * or cache briefly) and the wrapped form (persist next to the
     * ciphertexts it'll encrypt).
     */
    generateDek(): Promise<{ wrapped: string; plaintext: Buffer; keyId: string }>;

    /** Wrap an existing DEK with the active key during an explicit rotation. */
    wrap(plaintext: Buffer): Promise<{ wrapped: string; keyId: string }>;

    /**
     * Unwrap a previously generated DEK back to its plaintext.
     */
    unwrap(wrapped: string, keyId: string): Promise<Buffer>;

    /** Readiness check that does not attempt or expose plaintext key material. */
    hasKey(keyId: string): boolean;
}
