export interface KVStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;

    /**
     * Returns all entries whose key matches the glob pattern.
     * Supports only `*` as wildcard (e.g. "analytics:*", "session:user:*").
     * Omit pattern to get every entry.
     */
    entries(pattern?: string): Promise<Map<string, string>>;
    keys(pattern?: string): Promise<string[]>;
}
