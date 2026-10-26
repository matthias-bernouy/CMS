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
    readonly description?: CollectionTranslationKey;
    /** Blocs referenced by this document, derived during admission. */
    readonly uses: readonly string[];
    /** Capabilities called directly by this Page. Bloc requirements remain owned by Blocs. */
    readonly requires: readonly CollectionCapabilityRequirement[];
    readonly document: CollectionPageDocument;
}

/** A viewport shared by the explorer and generated capture. */
export interface CollectionExamplePreview {
    readonly id: string;
    readonly frame: { readonly width: number; readonly height: number };
    readonly locale: string;
    readonly themeMode: "light" | "dark";
}

/** Demonstration data, never an installed Page or a site-wide text override. */
export interface CollectionExample {
    readonly id: string;
    readonly label: CollectionTranslationKey;
    readonly description: CollectionTranslationKey;
    readonly document: PageDocument;
    readonly texts: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;
    readonly previews: readonly CollectionExamplePreview[];
}
