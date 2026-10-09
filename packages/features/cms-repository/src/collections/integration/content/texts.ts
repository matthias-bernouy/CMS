import type { CollectionRelease } from "@bernouy/cms-repository/collections";
import { renderContentTexts, type ContentTextSource } from "@bernouy/cms-content/rendering";
import { resolveCollectionTexts } from "@bernouy/cms-repository/collections/texts";

/** Trusted, public catalogue inputs. */
export interface CollectionTextSource {
    collection: Pick<CollectionRelease, "collectionId" | "locale" | "texts">;
    overrides?: unknown;
}

export function projectCollectionTextSource(source: CollectionTextSource): ContentTextSource {
    return {
        namespace: source.collection.collectionId,
        resolve: (locale) =>
            Object.fromEntries(
                Object.entries(resolveCollectionTexts(source.collection, locale, source.overrides)).map(
                    ([id, text]) => [id, text.value],
                ),
            ),
    };
}

/** Server-only DOM pass. Does not inspect or evaluate browser binding expressions. */
export function renderCollectionTexts(
    root: Element,
    locale: string,
    sources: readonly CollectionTextSource[],
    options: { skipSubtree?: (element: Element) => boolean } = {},
): void {
    renderContentTexts(root, locale, sources.map(projectCollectionTextSource), options);
}
