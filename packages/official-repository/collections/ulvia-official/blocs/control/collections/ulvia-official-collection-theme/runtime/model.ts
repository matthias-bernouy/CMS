export type ThemeMode = "light" | "dark";
export type ThemeToken = {
    id: string;
    variable: string;
    label: string;
    description: string;
    type: "color" | "font-family" | "length" | "number" | "shadow" | "value";
    defaults?: Partial<Record<ThemeMode, string>>;
};
export type ThemeCategory = { id: string; label: string; description: string; tokens: ThemeToken[] };
export type ThemeSource = {
    id: string;
    label: string;
    supportsModes: boolean;
    categories: ThemeCategory[];
    owner?: { kind: string; collectionId?: string };
};
export type ThemeProfile = { id: string; name: string; values: Record<ThemeMode, Record<string, string>> };
export type ThemeSettings = { activeThemeId: string; sources: ThemeSource[]; themes: ThemeProfile[] };
export type ThemeDocument = { revision: number; activeThemeId: string; themeJson: string };

export function sourceFor(settings: ThemeSettings, collectionId: string): ThemeSource | undefined {
    return settings.sources.find(
        (source) => source.owner?.kind === "collection" && source.owner.collectionId === collectionId,
    );
}

export function profileFor(settings: Readonly<ThemeSettings>, profileId: string): ThemeProfile | undefined {
    return settings.themes.find(({ id }) => id === profileId) ?? settings.themes[0];
}

export function tokenValue(profile: ThemeProfile, token: ThemeToken, mode: ThemeMode): string {
    return profile.values[mode]?.[token.id] ?? token.defaults?.[mode] ?? token.defaults?.light ?? "";
}
