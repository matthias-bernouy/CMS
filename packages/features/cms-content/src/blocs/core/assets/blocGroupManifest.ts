import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import { createBlocUsageResolver } from "cms-content/blocs/core/usage/resolveUsedBlocTags";
import { groupBlocsBySignature, type BlocGroups } from "./groupBlocsBySignature";

const TTL_MS = 5 * 60_000;
type Memo = { promise: Promise<BlocGroups>; computedAt: number };
const memo = new WeakMap<ContentReader, Memo>();

/** Build and briefly memoize the stable Bloc groups used by published Pages. */
export function getBlocGroupManifest(content: ContentReader): Promise<BlocGroups> {
    const now = Date.now();
    const cached = memo.get(content);
    if (cached && now - cached.computedAt < TTL_MS) {
        return cached.promise;
    }
    const promise = computeBlocGroupManifest(content);
    memo.set(content, { promise, computedAt: now });
    promise.catch(() => {
        if (memo.get(content)?.promise === promise) {
            memo.delete(content);
        }
    });
    return promise;
}

async function computeBlocGroupManifest(content: ContentReader): Promise<BlocGroups> {
    const [pages, blocs] = await Promise.all([content.getPublishedPages(), content.getRenderableBlocs()]);
    const resolveUsage = createBlocUsageResolver(blocs, content);
    return groupBlocsBySignature(await Promise.all(pages.map((page) => resolveUsage(page.content))));
}
