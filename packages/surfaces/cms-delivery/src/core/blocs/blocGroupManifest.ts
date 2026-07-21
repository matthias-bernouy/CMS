import type DeliveryCms from "cms-delivery/DeliveryCms";
import { createBlocUsageResolver } from "@bernouy/cms-content";
import { groupBlocsBySignature, type BlocGroups } from "cms-delivery/core/blocs/groupBlocsBySignature";

/**
 * Lazy, TTL-cached signature grouping of every bloc across all stored pages.
 *
 * The grouping is derived from real usage: each page's bloc set is computed
 * exactly as `renderPage` does, then `groupBlocsBySignature` buckets blocs by
 * the set of pages that use them. No analytics, no hand-assigned categories.
 *
 * Recompute policy = lazy + TTL: the manifest is built on first use and reused
 * for `TTL_MS`, then rebuilt on the next request after expiry. A stale manifest
 * is never a correctness bug — `resolveAssets` falls back to a per-page bundle
 * for any tag the manifest doesn't know — so the only effect of staleness is a
 * brief lag before a new bloc joins a stable group (and a one-off URL change
 * when group membership genuinely shifts). Full freshness (invalidate on page
 * publish) is a later refinement; this keeps the scan off the hot path.
 *
 * Scanning every page is the cost; TTL amortises it. The in-flight promise is
 * cached so concurrent cold requests share one scan, and a failed scan is
 * dropped so the next request retries instead of caching the rejection.
 * Memoised per `DeliveryCms` instance via a WeakMap (GC-friendly).
 */
const TTL_MS = 5 * 60_000;

type Memo = { promise: Promise<BlocGroups>; computedAt: number };
const memo = new WeakMap<DeliveryCms, Memo>();

export function getBlocGroupManifest(delivery: DeliveryCms): Promise<BlocGroups> {
    const now = Date.now();
    const cached = memo.get(delivery);
    if (cached && now - cached.computedAt < TTL_MS) {
        return cached.promise;
    }

    const promise = computeBlocGroupManifest(delivery);
    memo.set(delivery, { promise, computedAt: now });
    promise.catch(() => {
        if (memo.get(delivery)?.promise === promise) {
            memo.delete(delivery);
        }
    });
    return promise;
}

async function computeBlocGroupManifest(delivery: DeliveryCms): Promise<BlocGroups> {
    const repository = delivery.repository;
    const [pages, blocList] = await Promise.all([repository.getAllPages(), repository.getBlocsList()]);

    const resolveUsage = createBlocUsageResolver(blocList, repository);
    const pageBlocSets = await Promise.all(pages.map((page) => resolveUsage(page.content)));

    return groupBlocsBySignature(pageBlocSets);
}
