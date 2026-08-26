import type { ContentReader } from "cms-content/interfaces/ContentReader";
import { findUsedBlocTags } from "cms-content/core/blocs/usage/findUsedBlocTags";

type BlocListItem = { id: string; compositionHTML?: string };

/**
 * Resolves page blocs and the blocs referenced by server composition templates
 * or compiled component views. The same tag scanner follows both dependency
 * forms without making authored blocs register each other manually.
 */
export function createBlocUsageResolver(
    blocList: BlocListItem[],
    repository: Pick<ContentReader, "getBlocViewJS">,
): (content: string) => Promise<string[]> {
    const viewCache = new Map<string, Promise<string | null>>();
    const compositionByTag = new Map(blocList.map((bloc) => [bloc.id, bloc.compositionHTML]));

    const viewFor = (tag: string): Promise<string | null> => {
        const cached = viewCache.get(tag);
        if (cached) {
            return cached;
        }

        const pending = repository.getBlocViewJS(tag).catch((error: unknown) => {
            if (viewCache.get(tag) === pending) {
                viewCache.delete(tag);
            }
            throw error;
        });
        viewCache.set(tag, pending);
        return pending;
    };

    return async (content: string): Promise<string[]> => {
        const used = new Set(findUsedBlocTags(content, blocList));
        let frontier = [...used];

        while (frontier.length > 0) {
            const sources = await Promise.all(
                frontier.map(async (tag) => {
                    const composition = compositionByTag.get(tag);
                    return [composition, await viewFor(tag)];
                }),
            );
            const next = new Set<string>();
            for (const sourcesForTag of sources) {
                for (const source of sourcesForTag) {
                    if (!source) {
                        continue;
                    }
                    for (const tag of findUsedBlocTags(source, blocList)) {
                        if (!used.has(tag)) {
                            next.add(tag);
                        }
                    }
                }
            }
            frontier = [...next];
            for (const tag of frontier) {
                used.add(tag);
            }
        }

        return [...used].sort();
    };
}
