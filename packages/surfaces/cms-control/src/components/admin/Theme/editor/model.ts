import type {
    ThemeCategory,
    ThemeDefinition,
    ThemeSettings,
    ThemeSource,
    ThemeToken,
    ThemeTokenType,
} from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { isThemeCatalogEditable } from "../ownership";

export type RemovedThemeCategory = {
    sourceId: string;
    categoryId: string;
    sourceRemoved: boolean;
    selection: ThemeSelection;
};

export type NewThemeToken = {
    label: string;
    description: string;
    type: ThemeTokenType;
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

export function currentToken(
    settings: ThemeSettings | null,
    selection: ThemeSelection,
    tokenId: string,
): ThemeToken | undefined {
    return currentCategory(settings, selection)?.tokens.find((token) => token.id === tokenId);
}

export function addTheme(settings: ThemeSettings, name?: string): string {
    const number = settings.themes.length + 1;
    const id = uniqueId(`theme-${number}`, new Set(settings.themes.map((item) => item.id)));
    settings.themes.push({ id, name: name?.trim() || `New theme ${number}`, values: { light: {}, dark: {} } });
    return id;
}

export function renameTheme(settings: ThemeSettings, selectedThemeId: string, name: string): boolean {
    const theme = currentTheme(settings, selectedThemeId);
    const normalized = name.trim();
    if (!theme || !normalized) {
        return false;
    }
    theme.name = normalized;
    return true;
}

export function addCategory(
    settings: ThemeSettings,
    selection: ThemeSelection,
    label?: string,
    description?: string,
): { sourceId: string; category: ThemeCategory } | undefined {
    const source = currentSource(settings, selection);
    if (!isThemeCatalogEditable(source)) {
        return undefined;
    }
    const number = source.categories.length + 1;
    const id = uniqueId(`${source.id}-category-${number}`, new Set(source.categories.map((item) => item.id)));
    const category: ThemeCategory = {
        id,
        label: label?.trim() || `New group ${number}`,
        description: description?.trim() || `Variables for ${source.label}.`,
        tokens: [],
    };
    source.categories.push(category);
    return { sourceId: source.id, category };
}

export function updateCategory(
    settings: ThemeSettings,
    selection: ThemeSelection,
    label: string,
    description: string,
): { sourceId: string; category: ThemeCategory } | undefined {
    const source = currentSource(settings, selection);
    const category = currentCategory(settings, selection);
    const normalized = label.trim();
    if (!source || !category || !isThemeCatalogEditable(source) || !normalized) {
        return undefined;
    }
    category.label = normalized;
    category.description = description.trim();
    return { sourceId: source.id, category };
}

export function addToken(settings: ThemeSettings, selection: ThemeSelection, draft?: NewThemeToken): boolean {
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
    const number =
        settings.sources
            .filter(isThemeCatalogEditable)
            .flatMap((item) => item.categories)
            .reduce((count, item) => count + item.tokens.length, 0) + 1;
    const id = uniqueId(`site-variable-${number}`, existingNames);
    category.tokens.push({
        id,
        variable: id,
        label: draft?.label.trim() || `New variable ${number}`,
        description: draft ? draft.description.trim() : "New site variable",
        type: draft?.type ?? "value",
    });
    return true;
}

export function updateToken(
    settings: ThemeSettings,
    selection: ThemeSelection,
    tokenId: string,
    label: string,
    description: string,
): boolean {
    const source = currentSource(settings, selection);
    const token = currentToken(settings, selection, tokenId);
    const normalized = label.trim();
    if (!isThemeCatalogEditable(source) || !token || !normalized) {
        return false;
    }
    token.label = normalized;
    token.description = description.trim();
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
