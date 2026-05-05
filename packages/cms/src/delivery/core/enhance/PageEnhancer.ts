import type DeliveryCms from "src/delivery/DeliveryCms";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";
import type { PlaywrightSession } from "src/delivery/core/enhance/PlaywrightSession";
import { enhancePage, type EnhancePagePayload } from "src/delivery/core/enhance/enhancePage";

/**
 * Façade owned by `DeliveryCms`. Exposes a single `enhance(path, origin)`
 * that runs the full Playwright → measure → rewrite pass and only resolves
 * once the enhanced bytes are in the cache. Callers are expected to
 * `await` — this is what lets the first visitor (often the CDN) see the
 * final HTML instead of caching the un-enhanced first pass.
 *
 * The `PlaywrightSession` is injected so it can be shared across tenants
 * — one Chromium process amortized across N DeliveryCms instances. The
 * dedup map is per-enhancer (cache keys aren't tenant-prefixed).
 *
 * Concurrent calls for the same page share a single in-flight promise so
 * N simultaneous cold requests don't spawn N Playwright contexts. Distinct
 * pages run in parallel — the browser handles multiple contexts fine.
 *
 * A Playwright launch failure inside `PlaywrightSession` silently disables
 * future runs, so consumers never need to check a capability flag.
 */
export class PageEnhancer {
    private _inFlight = new Map<string, Promise<void>>();

    constructor(
        private _delivery: DeliveryCms,
        private _session:  PlaywrightSession,
    ) {}

    /**
     * Optimize the page at `path` (served by `origin`). Resolves when the
     * optimized entry is in `delivery.cache`, or earlier if optimization
     * bails (Playwright disabled, no images, cache entry missing…) — in all
     * bail cases the cache is left untouched and the caller serves whatever
     * is already there.
     */
    async enhance(path: string, origin: string): Promise<void> {
        const cacheKey = P9R_CACHE.page(path);

        const existing = this._inFlight.get(cacheKey);
        if (existing) return existing;

        const payload: EnhancePagePayload = { path, origin, cacheKey };
        const promise = enhancePage(payload, this._session, this._delivery)
            .finally(() => this._inFlight.delete(cacheKey));
        this._inFlight.set(cacheKey, promise);
        return promise;
    }
}
