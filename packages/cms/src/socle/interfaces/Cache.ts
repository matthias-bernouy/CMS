export type CacheEntry = {
    raw: Uint8Array;
    brotli: Uint8Array;
    gzip: Uint8Array;
    contentType: string;
    /**
     * Short hex digest of `raw`, computed once by `compress()`. Used to build
     * content-addressed URLs (`?v=<hash>`) so public assets can be served
     * with `Cache-Control: immutable` — any content change produces a new
     * hash, hence a new URL, hence a fresh fetch.
     */
    hash: string;
}

export interface Cache {
    get(key: string): CacheEntry | null;
    set(key: string, value: CacheEntry): void;
    delete(key: string): void;
    /**
     * Delete every entry whose key matches `predicate`. Used for cache
     * invalidation patterns that span multiple keys (e.g. invalidating every
     * rendered page when the theme changes).
     */
    deleteMatching(predicate: (key: string) => boolean): void;
}
