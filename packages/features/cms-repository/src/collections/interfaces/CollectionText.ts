import type { CollectionTranslationKey } from "./CollectionRelease";

export interface CollectionText {
    readonly id: string;
    readonly label?: CollectionTranslationKey;
    readonly description?: CollectionTranslationKey;
    readonly category?: CollectionTranslationKey;
    readonly group?: CollectionTranslationKey;
    readonly values: Readonly<Record<string, string>>;
}

/** Site-owned values, stored separately from immutable collection releases. */
export type CollectionTextOverrides = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface ResolvedCollectionText {
    readonly key: string;
    readonly locale: string;
    readonly origin: "collection" | "site";
    readonly fallback: boolean;
    readonly value: string;
}
