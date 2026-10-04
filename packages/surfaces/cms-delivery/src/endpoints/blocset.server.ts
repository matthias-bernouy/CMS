import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateBlocSetEntry } from "@bernouy/cms-content/rendering";
import { resolveCollectionAssetExpressions } from "cms-delivery/core/assets/collectionAssets";
import { collectionBlocsetCacheKey } from "cms-delivery/core/assets/resolveAssets";

/**
 * Serve ONE bundle = the concatenated viewJS of several blocs, for the
 * signature-grouped delivery path. URL shape:
 * `/.cms/blocset?tags=<a,b,c>&r=<collection-revision>&v=<hash>`.
 *
 * The tag set is canonicalised (deduped + sorted) in both the cache key
 * (including the installed-collection revision) and the generator, so any page referencing the same
 * set hits the same immutable bytes. Mirrors `bloc.server.ts`; the `?v` hash
 * flips `publicAssetCacheControl` to `immutable` exactly as for single blocs.
 *
 * This is the live grouped path: `resolveAssets` emits `/blocset?tags=…&r=…&v=`
 * for each signature-grouped bundle (the `/bloc?tag=` route is dev/editor only).
 */
export default async function BlocSetServer(req: Request, delivery: DeliveryCms) {
    const url = new URL(req.url);
    const tagsParam = url.searchParams.get("tags");
    const revision = Number(url.searchParams.get("r") ?? "0");

    if (!tagsParam || !Number.isSafeInteger(revision) || revision < 0) {
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
        collectionBlocsetCacheKey(tags, revision),
        delivery.cache,
        () =>
            generateBlocSetEntry(tags, {
                getBlocViewJS: async (tag) => {
                    const source = await delivery.repository.getBlocViewJS(tag);
                    return source ? resolveCollectionAssetExpressions(source, delivery) : null;
                },
            }),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());
}
