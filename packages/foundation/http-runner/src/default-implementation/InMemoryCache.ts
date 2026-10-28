import type { Cache, CacheEntry } from "http-runner/interfaces/Cache";

/**
 * In-process cache backed by a `Map`. Used by the Edge for the Admin
 * surface (compressed editor bundle, admin HTML, etc.).
 *
 * In `MODE=DEV`, reads always miss and writes are no-ops so any edit to
 * theme/blocs/pages is immediately visible without manual invalidation.
 */
export class InMemoryCache implements Cache {
    private readonly store = new Map<string, CacheEntry>();
    private readonly isDev = process.env.MODE === "DEV";
    private readonly maxEntries: number;

    constructor(options: { maxEntries?: number } = {}) {
        this.maxEntries = options.maxEntries ?? 2_048;
        if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) {
            throw new TypeError("In-memory cache maxEntries must be a positive safe integer");
        }
    }

    get(key: string): CacheEntry | null {
        if (this.isDev) {
            return null;
        }
        const entry = this.store.get(key);
        if (!entry) {
            return null;
        }
        this.store.delete(key);
        this.store.set(key, entry);
        return entry;
    }

    set(key: string, value: CacheEntry): void {
        if (this.isDev) {
            return;
        }
        this.store.delete(key);
        this.store.set(key, value);
        while (this.store.size > this.maxEntries) {
            const oldest = this.store.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.store.delete(oldest);
        }
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    deleteMatching(predicate: (key: string) => boolean): void {
        for (const key of this.store.keys()) {
            if (predicate(key)) {
                this.store.delete(key);
            }
        }
    }
}
