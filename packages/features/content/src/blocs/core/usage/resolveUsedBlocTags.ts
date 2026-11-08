import type { ContentReader } from "content/application/interfaces/ContentReader";
import { findUsedBlocTags } from "content/blocs/core/usage/findUsedBlocTags";

type BlocListItem = { id: string; markupHTML: string; uses?: readonly string[] };
export type BlocViewCache = Map<string, Promise<string | null>>;

/**
 * Resolves page blocs and the blocs referenced by server composition templates
 * or compiled component views. The same tag scanner follows both dependency
 * forms without making authored blocs register each other manually.
 */
export function createBlocUsageResolver(
    blocList: BlocListItem[],
    repository: Pick<ContentReader, "getBlocViewJS"> & Partial<Pick<ContentReader, "getBlocViewsJS">>,
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

    const getViews = repository.getBlocViewsJS?.bind(repository);
    const viewsFor = (tags: string[]): Promise<(string | null)[]> => {
        const missing = tags.filter((tag) => !viewCache.has(tag));
        if (getViews && missing.length) {
            const loaded = Promise.resolve().then(() => getViews(missing));
            for (const tag of missing) {
                const pending = loaded
                    .then((views) => views[tag] ?? null)
                    .catch((error: unknown) => {
                        if (viewCache.get(tag) === pending) {
                            viewCache.delete(tag);
                        }
                        throw error;
                    });
                viewCache.set(tag, pending);
            }
        }
        return Promise.all(tags.map(viewFor));
    };

    return async (content: string): Promise<string[]> => {
        const used = new Set(findUsedBlocTags(content, blocList));
        let frontier = [...used];

        while (frontier.length > 0) {
            const views = await viewsFor(frontier);
            const sources = frontier.map((tag, index) => [compositionByTag.get(tag), views[index]]);
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
