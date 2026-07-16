export type ThemeTokenType = "color" | "value";
export type ThemeMode = "light" | "dark";

export type ThemeToken = {
    /** Stable identifier used by persisted theme values. */
    id: string;
    /** CSS custom property name, without the leading `--`. */
    variable: string;
    label: string;
    description: string;
    type: ThemeTokenType;
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
};

export type ThemeDefinition = {
    id: string;
    name: string;
    values: Record<ThemeMode, Record<string, string>>;
};

/**
 * Site-wide token catalog plus interchangeable value sets. The catalog is
 * deliberately shared: a block can keep referring to the same CSS variable
 * when the active theme changes.
 */
export type ThemeSettings = {
    activeThemeId: string;
    sources: ThemeSource[];
    themes: ThemeDefinition[];
};
