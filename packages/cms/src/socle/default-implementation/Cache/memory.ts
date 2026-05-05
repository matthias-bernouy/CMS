import type { Cache, CacheEntry } from "src/socle/interfaces/Cache";

/**
 * In-process cache backed by a `Map`. Used by `ControlCms` for the admin
 * surface (compressed editor bundle, admin HTML, etc.).
 *
 * In `MODE=DEV`, reads always miss and writes are no-ops so any edit to
 * theme/snippets/blocs is immediately visible without manual invalidation.
 */
export class InMemoryCache implements Cache {

    private readonly store = new Map<string, CacheEntry>();
    private readonly isDev = process.env.MODE === "DEV";

    get(key: string): CacheEntry | null {
        if (this.isDev) return null;
        return this.store.get(key) ?? null;
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
