import type { ControlCms } from "src/control/ControlCms";
import type { CacheEntry } from "src/socle/interfaces/Cache";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "src/socle/server/compression";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

/**
 * Serves a bloc's compiled view JS so the editor preview can register the
 * real custom element on the editor page. The admin has the bytes in its
 * own repository (same storage as Delivery writes to), so this endpoint is
 * self-sufficient — the editor never has to reach out to Delivery, which
 * would require CORS + an absolute `deliveryUrl`.
 *
 * Cache key `bloc:${tag}` is shared with Delivery's own endpoint so a
 * single-process deploy serves one entry to both layers; in split deploys
 * the two caches stay in sync through the bloc-upload invalidation path
 * (`bloc.post.ts` → `cache.delete(P9R_CACHE.bloc(tag))`).
 */
async function generateBlocEntry(tag: string, cms: ControlCms): Promise<CacheEntry> {
    const js = await cms.repository.getBlocViewJS(tag);
    if (!js) throw new Error(`Bloc not found: ${tag}`);
    return compress(js, "text/javascript");
}

export default async function BlocGet(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");
    if (!tag) return Response.error();

    return cachedResponseAsync(
        req,
        P9R_CACHE.bloc(tag),
        cms.cache,
        () => generateBlocEntry(tag, cms),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());
}
