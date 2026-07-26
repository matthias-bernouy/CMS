export type ThemeTokenType = "color" | "font-family" | "length" | "number" | "shadow" | "value";
export type ThemeMode = "light" | "dark";

export type ThemeTokenDefaults = Partial<Record<ThemeMode, string>>;

export type ThemeSourceOwner = { kind: "integration"; integrationId: string };

export type ThemeToken = {
    /** Stable identifier used by persisted theme values. */
    id: string;
    /** CSS custom property name, without the leading `--`. */
    variable: string;
    label: string;
    description: string;
    type: ThemeTokenType;
    /** Provider-owned fallback values. Configured theme values remain overrides. */
    defaults?: ThemeTokenDefaults;
};

export type ThemeCategory = {
    id: string;
    label: string;
    description: string;
    tokens: ThemeToken[];
};

export type ThemeSource = {
    id: string;
    label: string;
    supportsModes: boolean;
    categories: ThemeCategory[];
    /** Provider ownership. Independent, author-managed sources omit this field. */
    owner?: ThemeSourceOwner;
};

export type ThemeTokenContribution = {
    id: string;
    label: string;
    description?: string;
    type: ThemeTokenType;
    defaults: { light: string; dark?: string };
};

export type ThemeCategoryContribution = {
    id: string;
    label: string;
    description?: string;
    tokens: ThemeTokenContribution[];
};

/** A local token catalog whose public names are derived by the CMS. */
export type IntegrationThemeContribution = {
    integrationId: string;
    label: string;
    categories: ThemeCategoryContribution[];
};

export type ThemeDefinition = {
    id: string;
    name: string;
    values: Record<ThemeMode, Record<string, string>>;
};

/**
 * Token catalogs plus interchangeable value sets. The catalog is deliberately
 * shared: a block can keep referring to the same CSS variable when the active
 * theme changes.
 */
export type ThemeSettings = {
    activeThemeId: string;
    sources: ThemeSource[];
    themes: ThemeDefinition[];
};
