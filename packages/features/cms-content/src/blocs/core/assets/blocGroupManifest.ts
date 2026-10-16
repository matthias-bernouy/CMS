import type { ContentReader, RenderableBloc } from "cms-content/application/interfaces/ContentReader";
import { createBlocUsageResolver } from "cms-content/blocs/core/usage/resolveUsedBlocTags";
import { groupBlocsBySignature, type BlocGroups } from "./groupBlocsBySignature";

const TTL_MS = 5 * 60_000;
type ContentRevision = number | string | undefined;
type Memo = { promise: Promise<BlocGroups>; computedAt: number; revision: ContentRevision };
const memo = new WeakMap<ContentReader, Memo>();

/** Build and briefly memoize the stable Bloc groups used by published Pages. */
export function getBlocGroupManifest(
    content: ContentReader,
    revision?: ContentRevision,
    renderableBlocs?: readonly RenderableBloc[],
): Promise<BlocGroups> {
    const now = Date.now();
    const cached = memo.get(content);
    if (cached && cached.revision === revision && now - cached.computedAt < TTL_MS) {
        return cached.promise;
    }
    const promise = computeBlocGroupManifest(content, renderableBlocs);
    memo.set(content, { promise, computedAt: now, revision });
    promise.catch(() => {
        if (memo.get(content)?.promise === promise) {
            memo.delete(content);
        }
    });
    return promise;
}

async function computeBlocGroupManifest(
    content: ContentReader,
    renderableBlocs?: readonly RenderableBloc[],
): Promise<BlocGroups> {
    const [pages, blocs] = await Promise.all([
        content.getPublishedPages(),
        renderableBlocs ?? content.getRenderableBlocs(),
    ]);
    const resolveUsage = createBlocUsageResolver([...blocs], content);
    return groupBlocsBySignature(await Promise.all(pages.map((page) => resolveUsage(page.content))));
}
