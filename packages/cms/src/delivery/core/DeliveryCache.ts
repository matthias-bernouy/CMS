import type { Cache, CacheEntry } from "src/socle/interfaces/Cache";

/**
 * In-memory cache scoped to the Delivery process. Stores pre-compressed
 * entries (raw + gzip + brotli + sha256 hash) produced by `compress()` so
 * each hit serves the right encoding without re-running compression.
 *
 * Dev mode (`MODE=DEV`) is a full bypass — `get` always returns `null` and
 * `set` is a no-op, so edits to theme/snippets/blocs are immediately
 * visible without having to invalidate keys by hand.
 *
 * Lives in `delivery/core` on purpose: Delivery is meant to stay deployable
 * alone, so it owns its own cache implementation rather than depending on
 * the admin-side provider.
 */
export class DeliveryCache implements Cache {

    private store = new Map<string, CacheEntry>();
    private readonly isDev = process.env.MODE === "DEV";

    get(key: string): CacheEntry | null {
        if (this.isDev) return null;
        return this.store.get(key) || null;
    }

    set(key: string, value: CacheEntry): void {
        if (this.isDev) return;
        this.store.set(key, value);
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    deleteMatching(predicate: (key: string) => boolean): void {
        for (const key of this.store.keys()) {
            if (predicate(key)) this.store.delete(key);
        }
    }

}
