/**
 * Persisted Data Encryption Key record. The plaintext DEK never lands
 * here — only the wrapped form returned by a `KekProvider`.
 *
 * `wrapped` is provider-opaque. Storage MUST round-trip it untouched.
 */
export type DekRecord = {
    scopeId: string;
    wrapped: string;
    createdAt: Date;
    rotatedAt: Date | null;
};

/**
 * Persistence contract for per-scope DEKs. `scopeId` is the primary
 * key — at most one DEK record per scope at any time.
 */
export interface DekRepository {
    get(scopeId: string): Promise<DekRecord | null>;
    /**
     * Insert-if-absent, atomically, and return the WINNING record: the
     * given one when this writer created the row, or the previously
     * stored record when another writer — possibly another process —
     * got there first. A blind last-write-wins upsert is forbidden
     * here: overwriting a scope's DEK silently makes every ciphertext
     * minted under the previous DEK unreadable. Callers must encrypt
     * with the returned record, never with the one they submitted.
     */
    create(record: DekRecord): Promise<DekRecord>;
    delete(scopeId: string): Promise<void>;
}
