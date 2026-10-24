import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import { findUsedBlocTags } from "cms-content/blocs/core/usage/findUsedBlocTags";

type BlocListItem = { id: string; markupHTML: string; uses?: readonly string[] };
export type BlocViewCache = Map<string, Promise<string | null>>;

/**
 * Resolves page blocs and the blocs referenced by server composition templates
 * or compiled component views. The same tag scanner follows both dependency
 * forms without making authored blocs register each other manually.
 */
export function createBlocUsageResolver(
    blocList: BlocListItem[],
    repository: Pick<ContentReader, "getBlocViewJS">,
    viewCache: BlocViewCache = new Map(),
): (content: string) => Promise<string[]> {
    const compositionByTag = new Map(blocList.map((bloc) => [bloc.id, bloc.markupHTML]));
    const dependenciesByTag = new Map(blocList.map((bloc) => [bloc.id, bloc.uses ?? []]));

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
            for (const [index, sourcesForTag] of sources.entries()) {
                for (const tag of dependenciesByTag.get(frontier[index]!) ?? []) {
                    if (!used.has(tag)) {
                        next.add(tag);
                    }
                }
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
