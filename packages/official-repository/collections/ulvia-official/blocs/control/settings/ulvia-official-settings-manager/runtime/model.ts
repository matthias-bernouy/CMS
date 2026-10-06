export type SiteSettings = {
    revision: number;
    name: string;
    host: string;
    language: string;
    visible: boolean;
};

export type AccessOverview = { site: SiteSettings };

export type LanguageSettings = {
    revision: number;
    language: string;
    additionalLanguages: string[];
    activeLanguages: string[];
};

export type LocalizationOverview = LanguageSettings;
