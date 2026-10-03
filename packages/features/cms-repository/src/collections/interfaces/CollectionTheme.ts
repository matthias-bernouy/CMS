import type { CollectionTranslationKey } from "./CollectionRelease";

export type CollectionThemeTokenType = "color" | "font-family" | "length" | "number" | "shadow" | "value";

export type CollectionThemeToken = {
    readonly id: string;
    readonly generation?: number;
    /** Collection translation key. */
    readonly label: CollectionTranslationKey;
    /** Collection translation key. */
    readonly description?: CollectionTranslationKey;
    readonly type: CollectionThemeTokenType;
    readonly defaults: Readonly<{ light: string; dark?: string }>;
};

export type CollectionThemeCategory = {
    readonly id: string;
    /** Collection translation key. */
    readonly label: CollectionTranslationKey;
    /** Collection translation key. */
    readonly description?: CollectionTranslationKey;
    readonly tokens: readonly CollectionThemeToken[];
};

/** Immutable catalogue. Site-owned theme values remain in settings. */
export type CollectionTheme = {
    /** Collection translation key. */
    readonly label: CollectionTranslationKey;
    readonly categories: readonly CollectionThemeCategory[];
};
