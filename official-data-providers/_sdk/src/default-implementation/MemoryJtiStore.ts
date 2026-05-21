import type { JtiStore } from "src/interfaces/JtiStore";

/**
 * Default `JtiStore` — in-memory, best-effort, per-instance (see the
 * interface doc). The single-instance default; multi-instance deployments
 * inject a shared atomic store (e.g. Redis `SET k v NX PX <ttl>`) via
 * `createProvider({ jti })`.
 *
 * `claim` is O(1): correctness comes from the per-key expiry check, NOT from
 * pruning — `jti` values are unique random ids, so an expired-but-not-yet-
 * pruned entry can never cause a false replay, only hold memory. Pruning is
 * therefore amortized (a full scan at most once per `pruneIntervalSec`)
 * instead of scanning the whole map on every call. No hard size cap: entries
 * are only stored AFTER signature verification, so growth tracks legitimate
 * traffic × TTL — capping could evict a live `jti` and reopen a replay window.
 */
export class MemoryJtiStore implements JtiStore {
    private readonly used = new Map<string, number>(); // jti -> expiresAtSec
    private lastPrune: number;

    constructor(private readonly now: () => number, private readonly pruneIntervalSec = 60) {
        this.lastPrune = now();
    }

    private maybePrune(t: number): void {
        if (t - this.lastPrune < this.pruneIntervalSec) return;
        this.lastPrune = t;
        for (const [jti, exp] of this.used) if (exp <= t) this.used.delete(jti);
    }

    /** Atomic test-and-set (no `await` between read and write): a live `jti`
     *  is rejected; an absent or expired one is (re)claimed. */
    async claim(jti: string, expiresAtSec: number): Promise<boolean> {
        const t = this.now();
        const existing = this.used.get(jti);
        if (existing !== undefined && existing > t) return false;   // still live → replay
        this.used.set(jti, expiresAtSec);                           // new or expired-overwrite
        this.maybePrune(t);
        return true;
    }
}
