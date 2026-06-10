import type { Cache, CacheEntry } from "@bernouy/cms-shared";

/** Default render-cache lifetime. Short on purpose: it is the freshness↔load
 *  knob for cross-process deployments — Control and Delivery run as separate
 *  processes with separate in-memory caches, so Control's invalidation never
 *  reaches Delivery. The TTL is what makes an admin change go live without a
 *  Delivery restart: a stale entry expires and re-renders from the (always
 *  pull-fresh) repository. Tune via `new DeliveryCache({ ttlMs })`. */
const DEFAULT_TTL_MS = 60_000;

/**
 * In-memory cache scoped to the Delivery process. Stores pre-compressed
 * entries (raw + gzip + brotli + sha256 hash) produced by `compress()` so
 * each hit serves the right encoding without re-running compression.
 *
 * Entries expire after `ttlMs` (lazy: checked on `get`). This bounds how long
 * a page can serve stale after an admin edit, since Delivery — a separate
 * process from Control — never sees Control's `cache.delete`. Content-addressed
 * assets re-render to identical bytes on expiry, so the TTL only ever costs a
 * cheap regeneration, never a wrong response.
 *
 * Dev mode (`MODE=DEV`) is a full bypass — `get` always returns `null` and
 * `set` is a no-op, so edits to theme/snippets/blocs are immediately visible.
 *
 * Lives in `delivery/core` on purpose: Delivery is meant to stay deployable
 * alone, so it owns its own cache implementation rather than depending on
 * the admin-side provider.
 */
export class DeliveryCache implements Cache {

    private store = new Map<string, { entry: CacheEntry; expiresAt: number }>();
    private readonly isDev = process.env.MODE === "DEV";
    private readonly ttlMs: number;
    private readonly now: () => number;

    constructor(opts: { ttlMs?: number; now?: () => number } = {}) {
        this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
        this.now   = opts.now ?? Date.now; // injectable for deterministic tests
    }

    get(key: string): CacheEntry | null {
        if (this.isDev) return null;
        const hit = this.store.get(key);
        if (!hit) return null;
        if (hit.expiresAt <= this.now()) {   // expired → drop, force a fresh render
            this.store.delete(key);
            return null;
        }
        return hit.entry;
    }

    set(key: string, value: CacheEntry): void {
        if (this.isDev) return;
        this.store.set(key, { entry: value, expiresAt: this.now() + this.ttlMs });
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
