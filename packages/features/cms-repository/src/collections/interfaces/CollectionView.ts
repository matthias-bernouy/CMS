import type { CollectionCapabilityRequirement, CollectionTranslationKey } from "./CollectionRelease";

/** Collection-owned Control HTML. Rendering and access belong to the site. */
export interface CollectionView {
    readonly id: string;
    readonly generation?: number;
    readonly name: CollectionTranslationKey;
    readonly icon?: string;
    readonly description?: CollectionTranslationKey;
    /** Blocs referenced by this view fragment, derived during admission. */
    readonly uses: readonly string[];
    /** Capabilities called directly by this view. Bloc requirements remain owned by blocs. */
    readonly requires: readonly CollectionCapabilityRequirement[];
    readonly html: string;
}
