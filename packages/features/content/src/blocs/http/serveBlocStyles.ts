import { isResourceId } from "@bernouy/resource-identity";
import { isValidCustomElementTag } from "content/application/core/validation/predicates";
import { publicAssetCacheControl, sendCompressed, type Cache } from "@bernouy/http-runner";
import type { ContentReader } from "content/application/interfaces/ContentReader";
import {
    collectionBlocStyleCacheKey,
    generateBlocStyleGroupEntry,
} from "content/blocs/core/assets/generateBlocStyleGroupEntry";

const CONTENT_REVISION = /^sha256:[0-9a-f]{64}$/u;
const CONTENT_VERSION = /^[0-9a-f]{10}$/u;
const MAX_TAGS = 128;
const MAX_TAGS_LENGTH = 16_384;

/** Serve one immutable contribution-owned stylesheet used by rendered Pages. */
export async function serveBlocStyles(
    request: Request,
    options: {
        content: Pick<ContentReader, "getRenderableBlocs">;
        cache: Cache;
        resolveContributedAssets(input: string): Promise<string>;
    },
): Promise<Response> {
    const url = new URL(request.url);
    const collectionId = url.searchParams.get("collection");
    const tagsParam = url.searchParams.get("tags");
    const revision = url.searchParams.get("r");
    const version = url.searchParams.get("v");
    if (
        !collectionId ||
        !isResourceId(collectionId) ||
        !tagsParam ||
        tagsParam.length > MAX_TAGS_LENGTH ||
        !revision ||
        !CONTENT_REVISION.test(revision) ||
        !version ||
        !CONTENT_VERSION.test(version)
    ) {
        return new Response(null, { status: 400 });
    }
    const tags = tagsParam.split(",").map((tag) => tag.trim());
    const canonicalTags = [...new Set(tags)].sort();
    if (
        tags.length === 0 ||
        tags.length > MAX_TAGS ||
        tags.some((tag) => !isValidCustomElementTag(tag)) ||
        tagsParam !== canonicalTags.join(",")
    ) {
        return new Response(null, { status: 400 });
    }
    const key = collectionBlocStyleCacheKey(collectionId, canonicalTags, revision);
    let entry = options.cache.get(key);
    if (!entry) {
        try {
            entry = await generateBlocStyleGroupEntry(
                collectionId,
                canonicalTags,
                options.content,
                options.resolveContributedAssets,
            );
        } catch {
            return new Response(null, { status: 404 });
        }
        if (entry.hash !== version) {
            return new Response(null, { status: 404 });
        }
        options.cache.set(key, entry);
    } else if (entry.hash !== version) {
        return new Response(null, { status: 404 });
    }
    return sendCompressed(request, entry, publicAssetCacheControl(request));
}
