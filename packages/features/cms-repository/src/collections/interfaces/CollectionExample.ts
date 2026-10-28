import type { PageDocument } from "@bernouy/cms-content/page-document";
import type { CollectionCapabilityRequirement, CollectionTranslationKey } from "./CollectionRelease";

export type { PageDocument } from "@bernouy/cms-content/page-document";

export interface CollectionExamplePreview {
    readonly id: string;
    readonly frame: { readonly width: number; readonly height: number };
}

/** Immutable source documents. Copying an example never creates a live collection Page. */
export interface CollectionExample {
    readonly id: string;
    readonly label: CollectionTranslationKey;
    readonly description: CollectionTranslationKey;
    readonly document: PageDocument;
    readonly requires: readonly CollectionCapabilityRequirement[];
    readonly previews: readonly CollectionExamplePreview[];
}
