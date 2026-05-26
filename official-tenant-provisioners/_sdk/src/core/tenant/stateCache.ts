import type { ResolvedIssuer } from "src/types/ResolvedIssuer";
import { createTtlCache, type TtlCache } from "src/core/ttlCache";

/**
 * Bounded-staleness cache for issuer resolution (base.md §5): re-read per
 * request, cached for a short TTL → `suspend`/`update` take effect in
 * **≤ 1 TTL** (bounded, not instant); `invalidate` makes a change effective
 * immediately. Negative results are cached too (bounds the cost of an
 * unknown/attacker `iss`). Backed by the shared, size-capped `TtlCache`
 * (see its doc for why the bound matters here: resolution happens before
 * signature verification).
 */
export type StateCache = TtlCache<ResolvedIssuer | null>;

export function createStateCache(opts: {
    now: () => number;            // epoch seconds
    ttlSeconds: number;
    load: (iss: string) => Promise<ResolvedIssuer | null>;
    /** Hard cap on cached issuers (default 1000). */
    maxEntries?: number;
}): StateCache {
    return createTtlCache<ResolvedIssuer | null>(opts);
}
