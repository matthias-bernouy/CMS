import { cachedResponseAsync, publicAssetCacheControl, type Cache } from "@bernouy/http-runner";
import { loadBindingCoreRuntimeEntry } from "cms-content/runtime-assets/runtimeAssets";
import { CMS_CACHE_KEYS } from "cms-content/application/core/cacheKeys";

/**
 * Serves the prebuilt `cms-binding-core` system-bloc runtime at
 * `<cmsPathPrefix>/assets/cms-binding-core.js`. Mirrors `component.server`:
 * the cache key is derived from the request URL so it stays aligned with
 * whatever prefix the kernel is booted with — `resolveAssets` computes the
 * same key when pre-warming the hash.
 */
export async function serveBindingCoreRuntime(req: Request, cache: Cache) {
    const url = new URL(req.url);
    const cacheKey = CMS_CACHE_KEYS.js(url.pathname);
    return cachedResponseAsync(req, cacheKey, cache, loadBindingCoreRuntimeEntry, publicAssetCacheControl(req));
}
