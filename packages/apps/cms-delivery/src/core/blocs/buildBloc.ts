import type { DeliveryRepository } from "cms-delivery/interfaces/DeliveryRepository";
import type { CacheEntry } from "@bernouy/cms-shared";
import { compress } from "@bernouy/cms-shared";

/**
 * Build the view bundle entry for a bloc. The repository returns the raw
 * JS string (already compiled by the import pipeline); we compress it into
 * a CacheEntry so every consumer — the endpoint, `resolveAssets`, the
 * build pipeline — hits the same cached bytes.
 *
 * Throws on unknown tag so the caller can surface a 404/5xx; the endpoint
 * swallows that into `Response.error()` and `renderPage`'s `Promise.all`
 * propagates it to the page's renderer fallback.
 */
export async function generateBlocEntry(tag: string, repository: DeliveryRepository): Promise<CacheEntry> {
    const js = await repository.getBlocViewJS(tag);
    if (!js) throw new Error(`Bloc not found: ${tag}`);
    return compress(js, "text/javascript");
}
