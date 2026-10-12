import type { CollectionCapabilityRequirement, CollectionTranslationKey } from "./CollectionRelease";
import type { PageDocument } from "@bernouy/cms-content/page-document";

export type { PageDocument } from "@bernouy/cms-content/page-document";

export type CollectionPageDocument = PageDocument;

/** One immutable collection-owned Page document. */
export interface CollectionPage {
    readonly id: string;
    readonly generation?: number;
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
