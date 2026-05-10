/**
 * Persisted Data Encryption Key record. The plaintext DEK never lands
 * here — only the wrapped form returned by a `KekProvider`.
 *
 * `wrapped` is provider-opaque. Storage MUST round-trip it untouched.
 */
export type DekRecord = {
    scopeId:   string;
    wrapped:   string;
    createdAt: Date;
    rotatedAt: Date | null;
};

/**
 * Persistence contract for per-scope DEKs. `scopeId` is the primary
 * key — at most one DEK record per scope at any time.
 */
export interface DekRepository {
    get(scopeId: string): Promise<DekRecord | null>;
    upsert(record: DekRecord): Promise<void>;
    delete(scopeId: string): Promise<void>;
}
