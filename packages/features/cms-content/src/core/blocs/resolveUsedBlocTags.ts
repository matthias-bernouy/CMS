import type { ContentReader } from "cms-content/interfaces/ContentReader";
import { findUsedBlocTags } from "cms-content/core/blocs/findUsedBlocTags";

type BlocListItem = { id: string };

/**
 * Resolves page blocs and the blocs referenced by their compiled templates.
 * Compiled view bundles retain template HTML, so the same tag scanner can
 * follow composition dependencies without making authored blocs register
 * each other manually.
 */
export function createBlocUsageResolver(
    blocList: BlocListItem[],
    repository: Pick<ContentReader, "getBlocViewJS">,
): (content: string) => Promise<string[]> {
    const viewCache = new Map<string, Promise<string | null>>();

    const viewFor = (tag: string): Promise<string | null> => {
        const cached = viewCache.get(tag);
        if (cached) return cached;

        const pending = repository.getBlocViewJS(tag).catch((error: unknown) => {
            if (viewCache.get(tag) === pending) viewCache.delete(tag);
            throw error;
        });
        viewCache.set(tag, pending);
        return pending;
    };

    return async (content: string): Promise<string[]> => {
        const used = new Set(findUsedBlocTags(content, blocList));
        let frontier = [...used];

        while (frontier.length > 0) {
            const views = await Promise.all(frontier.map(viewFor));
            const next = new Set<string>();
            for (const view of views) {
                if (!view) continue;
                for (const tag of findUsedBlocTags(view, blocList)) {
                    if (!used.has(tag)) next.add(tag);
                }
            }
            frontier = [...next];
            for (const tag of frontier) used.add(tag);
        }

        return [...used].sort();
    };
}
