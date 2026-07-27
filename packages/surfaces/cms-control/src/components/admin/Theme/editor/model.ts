import type { ThemeCategory, ThemeDefinition, ThemeSettings, ThemeSource } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { isThemeCatalogEditable } from "../ownership";

export type RemovedThemeCategory = {
    sourceId: string;
    categoryId: string;
    sourceRemoved: boolean;
    selection: ThemeSelection;
};

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
    if (!isThemeCatalogEditable(source)) {
        return undefined;
    }
    const number = source.categories.length + 1;
    const id = uniqueId(`${source.id}-category-${number}`, new Set(source.categories.map((item) => item.id)));
    const category: ThemeCategory = {
        id,
        label: `New category ${number}`,
        description: `Theme tokens for ${source.label}.`,
        tokens: [],
    };
    source.categories.push(category);
    return { sourceId: source.id, category };
}

export function addToken(settings: ThemeSettings, selection: ThemeSelection): boolean {
    const source = currentSource(settings, selection);
    const category = currentCategory(settings, selection);
    if (!isThemeCatalogEditable(source) || !category) {
        return false;
    }
    const existingNames = new Set(
        settings.sources.flatMap((item) =>
            item.categories.flatMap((entry) => entry.tokens.flatMap((token) => [token.id, token.variable])),
        ),
    );
    const number = existingNames.size + 1;
    const id = uniqueId(`token-${number}`, existingNames);
    category.tokens.push({
        id,
        variable: id,
        label: `New token ${number}`,
        description: "New theme token",
        type: "value",
    });
    return true;
}

export function removeToken(settings: ThemeSettings, selection: ThemeSelection, tokenId: string): boolean {
    const source = currentSource(settings, selection);
    const category = currentCategory(settings, selection);
    if (!isThemeCatalogEditable(source) || !category) {
        return false;
    }
    const index = category.tokens.findIndex((token) => token.id === tokenId);
    if (index < 0) {
        return false;
    }
    category.tokens.splice(index, 1);
    removeThemeValues(settings, [tokenId]);
    return true;
}

export function removeCategory(settings: ThemeSettings, selection: ThemeSelection): RemovedThemeCategory | undefined {
    const source = currentSource(settings, selection);
    const category = currentCategory(settings, selection);
    if (!isThemeCatalogEditable(source) || !category) {
        return undefined;
    }
    const destination =
        source.categories.length === 1
            ? settings.sources.find(
                  (item) => item !== source && isThemeCatalogEditable(item) && item.categories.length > 0,
              )
            : source;
    if (!destination) {
        return undefined;
    }
    const categoryIndex = source.categories.indexOf(category);
    source.categories.splice(categoryIndex, 1);
    removeThemeValues(
        settings,
        category.tokens.map((token) => token.id),
    );
    const sourceRemoved = source.categories.length === 0;
    if (sourceRemoved) {
        settings.sources.splice(settings.sources.indexOf(source), 1);
    }
    const nextSource = sourceRemoved ? destination : source;
    const nextCategory = sourceRemoved
        ? nextSource?.categories[0]
        : source.categories[Math.min(categoryIndex, source.categories.length - 1)];
    if (!nextSource || !nextCategory) {
        return undefined;
    }
    return {
        sourceId: source.id,
        categoryId: category.id,
        sourceRemoved,
        selection: { sourceId: nextSource.id, categoryId: nextCategory.id },
    };
}

export function resetTokenValue(
    settings: ThemeSettings,
    selection: ThemeSelection,
    selectedThemeId: string,
    mode: "light" | "dark",
    tokenId: string,
): boolean {
    const source = currentSource(settings, selection);
    const token = source?.categories.flatMap((category) => category.tokens).find((item) => item.id === tokenId);
    const theme = currentTheme(settings, selectedThemeId);
    if (!source || !token || !theme) {
        return false;
    }
    if (!token.defaults || !Object.hasOwn(theme.values[mode] ?? {}, token.id)) {
        return false;
    }
    delete theme.values[mode][token.id];
    return true;
}

function removeThemeValues(settings: ThemeSettings, tokenIds: string[]): void {
    for (const theme of settings.themes) {
        for (const mode of ["light", "dark"] as const) {
            for (const tokenId of tokenIds) {
                delete theme.values[mode]?.[tokenId];
            }
        }
    }
}

function uniqueId(base: string, existing: Set<string>): string {
    let value = base;
    let suffix = 2;
    while (existing.has(value)) {
        value = `${base}-${suffix++}`;
    }
    return value;
}
