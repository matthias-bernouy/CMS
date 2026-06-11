import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateBlocEntry, P9R_CACHE } from "@bernouy/cms-content";

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
export default async function BlocGet(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");
    if (!tag) return Response.error();

    return cachedResponseAsync(
        req,
        P9R_CACHE.bloc(tag),
        cms.cache,
        () => generateBlocEntry(tag, cms.repository),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());
}
