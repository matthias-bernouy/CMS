import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateBindingCoreJsEntry } from "cms-delivery/core/assets/buildBindingCore";
import { P9R_CACHE } from "@bernouy/cms-content";

/**
 * Serves the `cms-binding-core` system-bloc bundle at
 * `<cmsPathPrefix>/assets/cms-binding-core.js`. Mirrors `component.server`:
 * the cache key is derived from the request URL so it stays aligned with
 * whatever prefix the delivery is booted with — `resolveAssets` computes the
 * same key when pre-warming the hash.
 */
export default async function BindingCoreServer(req: Request, delivery: DeliveryCms) {
    const url = new URL(req.url);
    const cacheKey = P9R_CACHE.js(url.pathname);
    return cachedResponseAsync(req, cacheKey, delivery.cache, generateBindingCoreJsEntry, publicAssetCacheControl(req));
}
