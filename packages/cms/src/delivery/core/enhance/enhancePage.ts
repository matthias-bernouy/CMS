import type DeliveryCms from "src/delivery/DeliveryCms";
import { compress } from "src/socle/server/compression";
import { rewriteHTML, isOptimizable } from "src/delivery/core/enhance/rewriteHTML";
import { planEnhancement } from "src/delivery/core/enhance/planEnhancement";
import { VIEWPORT_HEIGHT } from "src/delivery/core/enhance/viewports";
import type { PlaywrightSession } from "src/delivery/core/enhance/PlaywrightSession";
import type { VariantSpec } from "src/delivery/interfaces/VariantSpec";

export type EnhancePagePayload = {
    /** Path of the page route to load (e.g. "/about" or "/"). */
    path: string;
    /** Origin of the running server, e.g. "http://localhost:3000". */
    origin: string;
    /** Cache key under which the rendered page is stored. */
    cacheKey: string;
};

/**
 * One end-to-end enhancement pass for the runtime serving path. Steps:
 *  1. Drive Playwright to the page URL and measure every `<img>` at every
 *     viewport. The inner request hits Delivery again — that's a cache hit
 *     (the caller populated the entry before calling us), so no recursion.
 *  2. Read the cache entry that the populate step wrote. If it's missing
 *     (an invalidation landed between populate and here), bail.
 *  3. Compute the plan (pure) — widths, sizes, loading, fetchpriority.
 *  4. Rewrite the HTML, resolving variant URLs through `formatImageUrl`
 *     so the resize-on-demand backend serves them at request time.
 *  5. Pre-warm the variant URLs so the first real visitor doesn't pay the
 *     origin-fetch cost on the storage backend.
 *  6. Replace the cached entry — but only if what's currently in cache is
 *     still the same bytes we started from (hash check). If someone wrote
 *     a fresher version while we were measuring, don't stomp it.
 */
export async function enhancePage(
    payload: EnhancePagePayload,
    session: PlaywrightSession,
    delivery: DeliveryCms,
): Promise<void> {
    const url = `${payload.origin}${payload.path}`;
    const measurements = await session.measureImages(url);
    if (!measurements || measurements.length === 0) return;

    const baseEntry = delivery.cache.get(payload.cacheKey);
    if (!baseEntry) return;
    const sourceHtml = new TextDecoder().decode(baseEntry.raw);

    const ladder = delivery.media.imageConfig.ladderWidths;
    const plan   = planEnhancement(measurements, ladder, VIEWPORT_HEIGHT);
    if (plan.rewrites.length === 0) return;

    const resolveUrl = (src: string, width: number) =>
        delivery.media.formatImageUrl({ url: src, width }).toString();

    const enhancedHtml  = rewriteHTML(sourceHtml, plan.rewrites, resolveUrl);
    const enhancedEntry = compress(enhancedHtml, baseEntry.contentType);

    await preWarmVariants(plan.variantsNeeded, resolveUrl);

    // Stale-write guard: only commit if the cache still holds the bytes we
    // based the rewrite on. An invalidation (admin save, TTL, manual clear)
    // between start and here means the base is no longer authoritative.
    const current = delivery.cache.get(payload.cacheKey);
    if (!current || current.hash !== baseEntry.hash) return;
    delivery.cache.set(payload.cacheKey, enhancedEntry);
}

/**
 * Pre-warm the media backend for every variant we just committed to. Runs
 * best-effort and sequential to avoid a bandwidth spike when many pages
 * are re-optimized back-to-back.
 */
async function preWarmVariants(
    variants: readonly VariantSpec[],
    resolveUrl: (src: string, width: number) => string,
): Promise<void> {
    for (const v of variants) {
        if (!isOptimizable(v.originalUrl)) continue;
        try {
            await fetch(resolveUrl(v.originalUrl, v.width));
        } catch {
            // Best-effort — a transient failure just means the first
            // real visitor pays the origin cost.
        }
    }
}
