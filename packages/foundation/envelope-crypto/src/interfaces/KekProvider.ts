/**
 * Abstraction over the master Key Encryption Key (KEK).
 *
 * Two impls in the wild:
 * - `LocalKekProvider`: KEK as a 32-byte buffer in the process — the
 *   provider wraps DEKs locally with AES-GCM. Fast, zero network I/O.
 * - `OvhOkmsKekProvider`: KEK lives inside an OVH OKMS service key
 *   (Customer Managed Key, never reachable by the process). The provider
 *   delegates wrap/unwrap to OVH's REST API over mTLS.
 *
 * The `wrapped` value is an opaque, provider-specific string. Local
 * encodes `<iv-b64>.<ciphertext-b64>`, OVH stores the JWE token directly.
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
