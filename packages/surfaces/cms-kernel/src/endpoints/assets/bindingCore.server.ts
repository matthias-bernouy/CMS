import type KernelCms from "cms-kernel/KernelCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateBindingCoreJsEntry } from "cms-kernel/core/assets/buildBindingCore";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";

/**
 * Serves the `cms-binding-core` system-bloc bundle at
 * `<cmsPathPrefix>/assets/cms-binding-core.js`. Mirrors `component.server`:
 * the cache key is derived from the request URL so it stays aligned with
 * whatever prefix the kernel is booted with — `resolveAssets` computes the
 * same key when pre-warming the hash.
 */
export default async function BindingCoreServer(req: Request, kernel: KernelCms) {
    const url = new URL(req.url);
    const cacheKey = CMS_CACHE_KEYS.js(url.pathname);
    return cachedResponseAsync(req, cacheKey, kernel.cache, generateBindingCoreJsEntry, publicAssetCacheControl(req));
}
