import { compress, type CacheEntry } from "@bernouy/http-runner";
import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import { CMS_CACHE_KEYS } from "cms-content/application/core/cacheKeys";

type RenderableBloc = Awaited<ReturnType<ContentReader["getRenderableBlocs"]>>[number];

/** Build one deterministic stylesheet for a contribution-owned Bloc group. */
export async function generateBlocStyleGroupEntry(
    collectionId: string,
    tags: readonly string[],
    content: Pick<ContentReader, "getRenderableBlocs">,
    resolveContributedAssets: (input: string) => Promise<string>,
): Promise<CacheEntry> {
    const byId = new Map((await content.getRenderableBlocs()).map((bloc) => [bloc.id, bloc]));
    const blocs = [...new Set(tags)].sort().map((tag) => {
        const bloc = byId.get(tag);
        if (!bloc?.styleCSS || bloc.styleCollectionId !== collectionId) {
            throw new Error(`Unknown Bloc style fragment: ${collectionId}.${tag}`);
        }
        return { id: tag, styleCSS: bloc.styleCSS };
    });
    if (blocs.length === 0) {
        throw new Error("Cannot generate an empty Bloc stylesheet");
    }
    return generateBlocStyleEntry(blocs, resolveContributedAssets);
}

export async function generateBlocStyleEntry(
    blocs: readonly { readonly id: string; readonly styleCSS: string }[],
    resolveContributedAssets: (input: string) => Promise<string>,
): Promise<CacheEntry> {
    const css = [...blocs]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((bloc) => bloc.styleCSS)
        .join("\n");
    return compress(await resolveContributedAssets(css), "text/css");
}

export function collectionBlocStyleCacheKey(
    collectionId: string,
    tags: readonly string[],
    collectionRevision: number | string,
): string {
    return `${CMS_CACHE_KEYS.blocStyles(collectionId)}:${[...new Set(tags)].sort().join(",")}:collections:${collectionRevision}`;
}

export function groupBlocStylesByCollection(
    tags: readonly string[],
    blocsById: ReadonlyMap<string, RenderableBloc>,
): { collectionId: string; tags: string[] }[] {
    const byCollection = new Map<string, string[]>();
    for (const tag of tags) {
        const bloc = blocsById.get(tag);
        if (!bloc?.styleCSS || !bloc.styleCollectionId) {
            continue;
        }
        const collected = byCollection.get(bloc.styleCollectionId) ?? [];
        collected.push(tag);
        byCollection.set(bloc.styleCollectionId, collected);
    }
    return [...byCollection]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([collectionId, collectedTags]) => ({ collectionId, tags: collectedTags.sort() }));
}
