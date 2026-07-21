import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { P9R_CACHE } from "@bernouy/cms-content";
import { generateBlocSetEntry } from "@bernouy/cms-content";

/**
 * Serve ONE bundle = the concatenated viewJS of several blocs, for the
 * signature-grouped delivery path. URL shape:
 * `/.cms/blocset?tags=<a,b,c>&v=<hash>`.
 *
 * The tag set is canonicalised (deduped + sorted) in both the cache key
 * (`P9R_CACHE.blocset`) and the generator, so any page referencing the same
 * set hits the same immutable bytes. Mirrors `bloc.server.ts`; the `?v` hash
 * flips `publicAssetCacheControl` to `immutable` exactly as for single blocs.
 *
 * This is the live grouped path: `resolveAssets` emits `/blocset?tags=…&v=`
 * for each signature-grouped bundle (the `/bloc?tag=` route is dev/editor only).
 */
export default async function BlocSetServer(req: Request, delivery: DeliveryCms) {
    const url = new URL(req.url);
    const tagsParam = url.searchParams.get("tags");

    if (!tagsParam) {
        return Response.error();
    }

    const tags = tagsParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    if (tags.length === 0) {
        return Response.error();
    }

    return cachedResponseAsync(
        req,
        P9R_CACHE.blocset(tags),
        delivery.cache,
        () => generateBlocSetEntry(tags, delivery.repository),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());
}
