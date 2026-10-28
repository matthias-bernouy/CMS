import { getOrGenerateEntryAsync, sendCompressed, publicAssetCacheControl, type Cache } from "@bernouy/http-runner";
import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import { generateBlocSetEntry } from "cms-content/blocs/core/composition/buildBlocEntries";
import { collectionBlocsetCacheKey } from "cms-content/blocs/core/assets/resolvePageAssets";

const BLOC_TAG = /^[a-z][a-z0-9]{0,62}-[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const CONTENT_REVISION = /^sha256:[0-9a-f]{64}$/u;
const MAX_TAGS = 128;
const MAX_TAGS_LENGTH = 16_384;

/**
 * Serve ONE bundle = the concatenated viewJS of several blocs, for the
 * signature-grouped edge path. URL shape:
 * `/_content/blocset?tags=<a,b,c>&r=<collection-revision>&v=<hash>`.
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
    const revision = url.searchParams.get("r");
    const versions = url.searchParams.getAll("v");
    if (versions.length > 1 || (versions.length === 1 && !/^[0-9a-f]{10}$/.test(versions[0]!))) {
        return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
    }

    if (!tagsParam || tagsParam.length > MAX_TAGS_LENGTH || !validRevision(revision)) {
        return new Response(null, { status: 400 });
    }

    const tags = tagsParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    if (tags.length === 0 || tags.length > MAX_TAGS || tags.some((tag) => !BLOC_TAG.test(tag))) {
        return new Response(null, { status: 400 });
    }

    try {
        const entry = await getOrGenerateEntryAsync(collectionBlocsetCacheKey(tags, revision), options.cache, () =>
            generateBlocSetEntry(tags, {
                getBlocViewJS: async (tag) => {
                    const source = await options.content.getBlocViewJS(tag);
                    return source ? options.resolveContributedAssets(source) : null;
                },
            }),
        );
        if (versions.length && entry.hash !== versions[0]) {
            return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
        }
        return sendCompressed(req, entry, publicAssetCacheControl(req));
    } catch {
        return new Response(null, { status: 500, headers: { "cache-control": "no-store" } });
    }
}

function validRevision(value: string | null): value is string {
    return value !== null && CONTENT_REVISION.test(value);
}
