import type { ThemeCategory, ThemeDefinition, ThemeSettings, ThemeSource, ThemeToken } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { isIntegrationSource } from "../ownership";

export function currentSource(settings: ThemeSettings | null, selection: ThemeSelection): ThemeSource | undefined {
    return settings?.sources.find((item) => item.id === selection.sourceId) ?? settings?.sources[0];
}

export function currentCategory(settings: ThemeSettings | null, selection: ThemeSelection): ThemeCategory | undefined {
    const source = currentSource(settings, selection);
    return source?.categories.find((item) => item.id === selection.categoryId) ?? source?.categories[0];
}

export function currentTheme(settings: ThemeSettings | null, selectedThemeId: string): ThemeDefinition | undefined {
    return settings?.themes.find((item) => item.id === selectedThemeId) ?? settings?.themes[0];
}

export function selectionFromUrl(settings: ThemeSettings | null): ThemeSelection {
    const sources = settings?.sources ?? [];
    const url = new URL(window.location.href);
    const sourceId = url.searchParams.get("type") ?? "";
    const categoryId = url.searchParams.get("category") ?? "";
    const source =
        sources.find((item) => item.id === sourceId) ??
        sources.find((item) => item.categories.some((category) => category.id === categoryId)) ??
        sources[0];
    const category = source?.categories.find((item) => item.id === categoryId) ?? source?.categories[0];
    return { sourceId: source?.id ?? "", categoryId: category?.id ?? "" };
}

export function addTheme(settings: ThemeSettings): string {
    const number = settings.themes.length + 1;
    const id = uniqueId(`theme-${number}`, new Set(settings.themes.map((item) => item.id)));
    settings.themes.push({ id, name: `New theme ${number}`, values: { light: {}, dark: {} } });
    return id;
}

export function addCategory(
    settings: ThemeSettings,
    selection: ThemeSelection,
): { sourceId: string; category: ThemeCategory } | undefined {
    const source = currentSource(settings, selection);
    if (!source || isIntegrationSource(source)) {
        return undefined;
    }
    const number = source.categories.length + 1;
    const id = uniqueId(`${source.id}-category-${number}`, new Set(source.categories.map((item) => item.id)));
    const category: ThemeCategory = {
        id,
        label: `New category ${number}`,
        description: `Custom ${source.label} tokens.`,
        tokens: [],
    };
    source.categories.push(category);
    return { sourceId: source.id, category };
}

export function addToken(settings: ThemeSettings, selection: ThemeSelection): void {
    const source = currentSource(settings, selection);
    const category = currentCategory(settings, selection);
    if (!source || !category || isIntegrationSource(source)) {
        return;
    }
    const allIds = new Set(
        settings.sources.flatMap((item) => item.categories.flatMap((entry) => entry.tokens.map((token) => token.id))),
    );
    const number = allIds.size + 1;
    const id = uniqueId(`custom-${number}`, allIds);
    category.tokens.push({
        id,
        variable: id,
        label: `New token ${number}`,
        description: "Custom design token",
        type: source.supportsModes ? "color" : "value",
    });
}

export function resetIntegrationTokenValue(
    settings: ThemeSettings,
    selection: ThemeSelection,
    selectedThemeId: string,
    mode: "light" | "dark",
    tokenId: string,
): boolean {
    const source = currentSource(settings, selection);
    const token = currentCategory(settings, selection)?.tokens.find((item) => item.id === tokenId);
    const theme = currentTheme(settings, selectedThemeId);
    if (!isIntegrationSource(source) || !token || !theme) {
        return false;
    }
    if (!token.defaults || !Object.hasOwn(theme.values[mode] ?? {}, token.id)) {
        return false;
    }
    delete theme.values[mode][token.id];
    return true;
}

export function themeSettingsFromCss(css: string): ThemeSettings {
    const values: Record<string, string> = {};
    const tokens: ThemeToken[] = [];
    const seen = new Set<string>();
    for (const match of css.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;{}]+)\s*;/gi)) {
        const variable = match[1]!.toLowerCase();
        if (seen.has(variable)) {
            continue;
        }
        seen.add(variable);
        const value = match[2]!.trim();
        tokens.push({
            id: variable,
            variable,
            label: variable.split("-").map(capitalize).join(" "),
            description: `Existing --${variable} variable`,
            type: looksLikeColor(value) ? "color" : "value",
        });
        values[variable] = value;
    }
    return {
        activeThemeId: "imported",
        sources: [
            {
                id: "other",
                label: "Other",
                supportsModes: false,
                categories: [
                    {
                        id: "general",
                        label: "General",
                        description: "Variables inferred from the current free-form stylesheet.",
                        tokens,
                    },
                ],
            },
        ],
        themes: [{ id: "imported", name: "Imported theme", values: { light: values, dark: {} } }],
    };
}

function uniqueId(base: string, existing: Set<string>): string {
    let value = base;
    let suffix = 2;
    while (existing.has(value)) {
        value = `${base}-${suffix++}`;
    }
    return value;
}

function capitalize(value: string): string {
    return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function looksLikeColor(value: string): boolean {
    return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lab\(|lch\(|color\(|transparent$|currentcolor$)/i.test(value);
}
