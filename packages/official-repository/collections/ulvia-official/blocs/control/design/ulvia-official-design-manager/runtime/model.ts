export type DesignOverview = {
    revision: number;
    collectionRevision: number;
    language: string;
    additionalLanguages: string[];
    activeLanguages: string[];
    activeThemeId: string;
    collections: { collectionId: string; textCount: number; overriddenLocaleCount: number }[];
};

export type LanguagesDocument = Pick<
    DesignOverview,
    "revision" | "language" | "additionalLanguages" | "activeLanguages"
>;

export type ThemeDocument = {
    revision: number;
    activeThemeId: string;
    themeJson: string;
};

export type TextCatalogue = {
    revision: number;
    collectionId: string;
    locale: string;
    overridesJson: string;
    items: {
        id: string;
        generation: number;
        label?: string;
        values: { locale: string; value: string }[];
        overrides: { locale: string; value: string }[];
    }[];
};
