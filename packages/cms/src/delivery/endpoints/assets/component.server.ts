import type DeliveryCms from "src/delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "src/socle/server/compression";
import { generateComponentJsEntry } from "src/delivery/core/assets/buildComponent";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

/**
 * Serves the component runtime bundle at `<cmsPathPrefix>/assets/component.js`.
 * Cache key is derived from the request URL so the key stays aligned with
 * whatever prefix the delivery is booted with — `renderPage` computes the
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
