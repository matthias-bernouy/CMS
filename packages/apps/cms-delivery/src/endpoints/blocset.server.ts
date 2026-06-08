import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl, P9R_CACHE } from "@bernouy/cms-shared";
import { generateBlocSetEntry } from "cms-delivery/core/blocs/buildBloc";

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
 * Additive for now — nothing emits these URLs yet; `resolveAssets` keeps
 * emitting one `/bloc?tag=` per bloc until the grouping switch (next stage).
 */
export default async function BlocSetServer(req: Request, delivery: DeliveryCms){

    const url       = new URL(req.url);
    const tagsParam = url.searchParams.get("tags");

    if (!tagsParam) return Response.error();

    const tags = tagsParam.split(",").map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) return Response.error();

    return cachedResponseAsync(
        req,
        P9R_CACHE.blocset(tags),
        delivery.cache,
        () => generateBlocSetEntry(tags, delivery.repository),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());

}
