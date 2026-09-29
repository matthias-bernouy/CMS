/**
 * Narrow read-only view of the secret store. Consumers that only ever
 * resolve a key to its value depend on this instead of the full
 * `SecretStore` — they can't write, list, or delete by
 * construction. `SecretStore` extends it, so any store satisfies both.
 */
export interface SecretReader {
    /** Returns the raw value, or `null` when the key isn't set. */
    get(key: string): Promise<string | null>;
}
