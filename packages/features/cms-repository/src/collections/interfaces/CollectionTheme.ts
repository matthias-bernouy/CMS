export type CollectionThemeTokenType = "color" | "font-family" | "length" | "number" | "shadow" | "value";

export type CollectionThemeToken = {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    readonly type: CollectionThemeTokenType;
    readonly defaults: Readonly<{ light: string; dark?: string }>;
};

export type CollectionThemeCategory = {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    readonly tokens: readonly CollectionThemeToken[];
};

/** Immutable catalogue. Site-owned theme values remain in settings. */
export type CollectionTheme = {
    readonly label: string;
    readonly categories: readonly CollectionThemeCategory[];
};
