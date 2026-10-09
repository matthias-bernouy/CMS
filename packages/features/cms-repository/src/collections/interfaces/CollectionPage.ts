import type { CollectionCapabilityRequirement, CollectionTranslationKey } from "./CollectionRelease";
import type { PageDocument, PageSurface } from "@bernouy/cms-content/page-document";

export type { PageDocument, PageSurface } from "@bernouy/cms-content/page-document";

export type CollectionPageSurface = PageSurface;
export type CollectionPageDocument = PageDocument;

/** One collection-owned document for exactly one rendering surface. */
export interface CollectionPage {
    readonly id: string;
    readonly generation?: number;
    readonly surface: CollectionPageSurface;
    /** Collection-provided route used only until the site chooses an override. */
    readonly defaultPath: string;
    readonly name: CollectionTranslationKey;
    readonly icon?: string;
    readonly description?: CollectionTranslationKey;
    /** Blocs referenced by this document, derived during admission. */
    readonly uses: readonly string[];
    /** Capabilities called directly by this Page. Bloc requirements remain owned by Blocs. */
    readonly requires: readonly CollectionCapabilityRequirement[];
    readonly document: CollectionPageDocument;
}
