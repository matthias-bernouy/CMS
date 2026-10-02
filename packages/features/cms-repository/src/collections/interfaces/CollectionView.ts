import type { CollectionTranslationKey } from "./CollectionRelease";

/** Collection-owned Control HTML. Rendering and access belong to the site. */
export interface CollectionView {
    readonly id: string;
    readonly name: CollectionTranslationKey;
    readonly icon?: string;
    readonly description?: CollectionTranslationKey;
    readonly html: string;
}
