import { cachedResponseAsync, publicAssetCacheControl, type Cache } from "@bernouy/http-runner";
import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import { generateBlocSetEntry } from "cms-content/blocs/core/composition/buildBlocEntries";
import { collectionBlocsetCacheKey } from "cms-content/blocs/core/assets/resolvePageAssets";

/**
 * Serve ONE bundle = the concatenated viewJS of several blocs, for the
 * signature-grouped kernel path. URL shape:
 * `/.cms/blocset?tags=<a,b,c>&r=<collection-revision>&v=<hash>`.
 *
 * The tag set is canonicalised (deduped + sorted) in both the cache key
 * (including the installed-collection revision) and the generator, so any page referencing the same
 * set hits the same immutable bytes. The `?v` hash flips
 * `publicAssetCacheControl` to `immutable`.
 */
export async function serveBlocSet(
    req: Request,
    options: {
        content: Pick<ContentReader, "getBlocViewJS">;
        cache: Cache;
        resolveContributedAssets(input: string): Promise<string>;
    },
) {
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
        options.cache,
        () =>
            generateBlocSetEntry(tags, {
                getBlocViewJS: async (tag) => {
                    const source = await options.content.getBlocViewJS(tag);
                    return source ? options.resolveContributedAssets(source) : null;
                },
            }),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());
}
