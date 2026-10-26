import type { CollectionTranslationKey, CollectionResourceDeprecation } from "./CollectionRelease";

export type CollectionThemeTokenType = "color" | "font-family" | "length" | "number" | "shadow" | "value";

export type CollectionThemeToken = {
    readonly deprecation?: CollectionResourceDeprecation;
    readonly id: string;
    /** Collection translation key. */
    readonly label: CollectionTranslationKey;
    /** Collection translation key. */
    readonly description?: CollectionTranslationKey;
    readonly type: CollectionThemeTokenType;
    readonly defaults: Readonly<{ light: string; dark?: string }>;
};

export type CollectionThemeFontFace = {
    readonly id: string;
    readonly type: "font-face";
    /** Collection-local WOFF2 asset path. */
    readonly asset: string;
    /** Logical family name; emitted CSS is namespaced by the collection. */
    readonly family: string;
    readonly style: "normal" | "italic" | "oblique";
    readonly weight: string;
    readonly display: "auto" | "block" | "swap" | "fallback" | "optional";
};

export type CollectionThemeEntry = CollectionThemeToken | CollectionThemeFontFace;

export type CollectionThemeCategory = {
    readonly id: string;
    /** Collection translation key. */
    readonly label: CollectionTranslationKey;
    /** Collection translation key. */
    readonly description?: CollectionTranslationKey;
    readonly entries: readonly CollectionThemeEntry[];
};

/** Immutable catalogue. Site-owned theme values remain in settings. */
export type CollectionTheme = {
    /** Collection translation key. */
    readonly label: CollectionTranslationKey;
    readonly categories: readonly CollectionThemeCategory[];
};
