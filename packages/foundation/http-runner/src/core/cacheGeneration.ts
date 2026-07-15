import type { Cache, CacheEntry } from "http-runner/interfaces/Cache";

/**
 * Generations currently running for each cache instance and cache key.
 *
 * The outer WeakMap does not retain discarded caches. Completed and failed
 * generations remove their key immediately, so this coordination layer does
 * not become a second cache.
 */
const pendingGenerations = new WeakMap<Cache, Map<string, Promise<CacheEntry>>>();

/** Return a cached entry or generate it synchronously on a miss. */
export function getOrGenerateEntry(
    key: string,
    cache: Cache,
    generate: () => CacheEntry,
): CacheEntry {
    let entry = cache.get(key);
    if (!entry) {
        entry = generate();
        cache.set(key, entry);
    }
    return entry;
}

/**
 * Return a cached entry or share one in-flight asynchronous generation.
 *
 * Sharing is scoped to the exact cache object and key. Rejections are shared
 * only by the current wave: cleanup always runs, so a later request retries.
 */
export function getOrGenerateEntryAsync(
    key: string,
    cache: Cache,
    generate: () => Promise<CacheEntry>,
): Promise<CacheEntry> {
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached);

    let byKey = pendingGenerations.get(cache);
    const existing = byKey?.get(key);
    if (existing) return existing;

    if (!byKey) {
        byKey = new Map();
        pendingGenerations.set(cache, byKey);
    }
    const generations = byKey;

    // Defer the generator by one microtask so the promise is registered before
    // user code can synchronously trigger an additional request for this key.
    const pending = Promise.resolve()
        .then(generate)
        .then((entry) => {
            cache.set(key, entry);
            return entry;
        })
        .finally(() => {
            if (generations.get(key) !== pending) return;
            generations.delete(key);
            if (generations.size === 0) pendingGenerations.delete(cache);
        });

    generations.set(key, pending);
    return pending;
}
