/**
 * Generic load-through cache with a per-key TTL and a hard size cap. Shared
 * by the issuer-trust state cache (§5) and the metadoc discovery cache (§4.4)
 * so the "Map + expiry + bounded eviction" logic lives in ONE place.
 *
 * The size cap matters for the state cache specifically: `verifyToken`
 * resolves the `iss` BEFORE the signature is checked, so an attacker can
 * spray random issuers; expired-first / oldest-next eviction keeps the map
 * from growing without bound (memory DoS). It is harmless for the discovery
 * cache (only reached for already-trusted issuers).
 *
 * `load` may throw (discovery rejects bad/unreachable metadoc) or return a
 * negative value (the state cache caches `null` for an unknown `iss`): a
 * throw is propagated and nothing is cached; a returned value is cached.
 */
export interface TtlCache<V> {
    get(key: string): Promise<V>;
    invalidate(key: string): void;
    clear(): void;
}

export function createTtlCache<V>(opts: {
    now: () => number;            // epoch seconds
    ttlSeconds: number;
    load: (key: string) => Promise<V>;
    /** Hard cap on cached keys (default 1000). */
    maxEntries?: number;
}): TtlCache<V> {
    const max = opts.maxEntries ?? 1000;
    const cache = new Map<string, { val: V; exp: number }>();

    function evictIfFull(): void {
        if (cache.size < max) return;
        const t = opts.now();
        for (const [k, e] of cache) if (e.exp <= t) cache.delete(k);   // expired first
        while (cache.size >= max) {
            const oldest = cache.keys().next().value;                  // then oldest-inserted
            if (oldest === undefined) break;
            cache.delete(oldest);
        }
    }

    return {
        async get(key) {
            const hit = cache.get(key);
            if (hit && hit.exp > opts.now()) return hit.val;
            const val = await opts.load(key);
            evictIfFull();
            cache.set(key, { val, exp: opts.now() + opts.ttlSeconds });
            return val;
        },
        invalidate(key) { cache.delete(key); },
        clear() { cache.clear(); },
    };
}
