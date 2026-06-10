import type { Cache, CacheEntry } from "http-runner/interfaces/Cache";

/**
 * In-memory `Cache` whose entries expire after `ttlMs` (lazy: checked on
 * `get`). The TTL is the freshness↔load knob for cross-process deployments:
 * a writer process's invalidation never reaches another process's in-memory
 * cache, so expiry is what bounds how long a stale entry can be served —
 * it only ever costs a cheap regeneration, never a wrong response.
 *
 * `bypass: true` turns the cache off entirely (`get` → null, `set` → no-op) —
 * the dev-mode switch, decided by the caller (e.g. `MODE=DEV`), never read
 * from the environment here.
 */
export class TtlCache implements Cache {

    private store = new Map<string, { entry: CacheEntry; expiresAt: number }>();
    private readonly bypass: boolean;
    private readonly ttlMs: number;
    private readonly now: () => number;

    constructor(opts: { ttlMs?: number; bypass?: boolean; now?: () => number } = {}) {
        this.ttlMs  = opts.ttlMs ?? 60_000;
        this.bypass = opts.bypass ?? false;
        this.now    = opts.now ?? Date.now; // injectable for deterministic tests
    }

    get(key: string): CacheEntry | null {
        if (this.bypass) return null;
        const hit = this.store.get(key);
        if (!hit) return null;
        if (hit.expiresAt <= this.now()) {   // expired → drop, force a fresh render
            this.store.delete(key);
            return null;
        }
        return hit.entry;
    }

    set(key: string, value: CacheEntry): void {
        if (this.bypass) return;
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
