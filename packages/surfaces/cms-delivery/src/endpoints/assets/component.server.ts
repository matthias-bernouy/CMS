import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateComponentJsEntry } from "cms-delivery/core/assets/buildComponent";
import { P9R_CACHE } from "@bernouy/cms-shared";

/**
 * Serves the component runtime bundle at `<cmsPathPrefix>/assets/component.js`.
 * Cache key is derived from the request URL so the key stays aligned with
 * whatever prefix the delivery is booted with — `resolveAssets` computes the
 * same key when pre-warming the hash.
 */
export default async function ComponentServer(req: Request, delivery: DeliveryCms) {
    const url = new URL(req.url);
    const cacheKey = P9R_CACHE.js(url.pathname);
    return cachedResponseAsync(
        req,
        cacheKey,
        delivery.cache,
        generateComponentJsEntry,
        publicAssetCacheControl(req),
    );
}
