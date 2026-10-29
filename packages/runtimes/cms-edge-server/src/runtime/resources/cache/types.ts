export type SharedPolicy = { fresh: number; staleWhileRevalidate: number; staleIfError: number; immutable: boolean };
export type CachedResource = {
    key: string;
    tags: readonly string[];
    headers: readonly [string, string][];
    raw: Uint8Array<ArrayBuffer>;
    gzip?: Uint8Array<ArrayBuffer>;
    storedAt: number;
    policy: SharedPolicy;
    bytes: number;
};
type ResourceLoad = { response: Response; cacheControl: string | null; tags?: readonly string[] };
export type CacheLoad = (request: Request) => Promise<ResourceLoad>;
export type CacheOptions = {
    enabled?: boolean;
    pages?: boolean;
    maxEntries?: number;
    maxBytes?: number;
    maxEntryBytes?: number;
    maxPending?: number;
    maxWaiters?: number;
    now?: () => number;
    event?: (outcome: string) => void;
};
