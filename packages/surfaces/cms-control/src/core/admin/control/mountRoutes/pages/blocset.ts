import { createContentReader } from "@bernouy/cms-content";
import { generateBlocSetEntry } from "@bernouy/cms-content/rendering";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import { resolveCollectionAssets } from "./collectionAssets";

const CUSTOM_ELEMENT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/u;
const MAX_TAGS = 128;

export async function serveControlBlocset(request: Request, state: ControlCmsState): Promise<Response> {
    const url = new URL(request.url);
    const revision = Number(url.searchParams.get("r"));
    const tags = [...new Set((url.searchParams.get("tags") ?? "").split(",").filter(Boolean))].sort();
    if (
        tags.length === 0 ||
        tags.length > MAX_TAGS ||
        tags.some((tag) => tag.length > 128 || !CUSTOM_ELEMENT.test(tag)) ||
        !Number.isSafeInteger(revision) ||
        revision < 0
    ) {
        return new Response(null, { status: 400 });
    }
    const reader = createContentReader(state.repository);
    const actualRevision = (await reader.getCollectionRevision?.()) ?? 0;
    if (revision !== actualRevision) {
        return new Response(null, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const releases = (
        await state.configuration.collections?.store.snapshot(state.configuration.collections.siteId)
    )?.collections.map(({ release }) => release);
    return cachedResponseAsync(
        request,
        `control:blocset:${revision}:${tags.join(",")}`,
        state.cache,
        () =>
            generateBlocSetEntry(tags, {
                getBlocViewJS: async (tag) => {
                    const source = await reader.getBlocViewJS(tag);
                    return source && state.configuration.deliveryUrl && releases
                        ? resolveCollectionAssets(source, releases, state.configuration.deliveryUrl)
                        : source;
                },
            }),
        publicAssetCacheControl(request),
    );
}
