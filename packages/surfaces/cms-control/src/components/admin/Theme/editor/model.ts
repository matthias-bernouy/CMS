import type { ThemeCategory, ThemeDefinition, ThemeSettings, ThemeSource } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { isIntegrationSource, isSiteTokenSource } from "../ownership";

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
    if (!isSiteTokenSource(source)) {
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

export function addToken(settings: ThemeSettings, selection: ThemeSelection): boolean {
    const source = currentSource(settings, selection);
    const category = currentCategory(settings, selection);
    if (!isSiteTokenSource(source) || !category) {
        return false;
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
        type: "value",
    });
    return true;
}

export function resetIntegrationTokenValue(
    settings: ThemeSettings,
    selection: ThemeSelection,
    selectedThemeId: string,
    mode: "light" | "dark",
    tokenId: string,
): boolean {
    const source = currentSource(settings, selection);
    const token = source?.categories.flatMap((category) => category.tokens).find((item) => item.id === tokenId);
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

function uniqueId(base: string, existing: Set<string>): string {
    let value = base;
    let suffix = 2;
    while (existing.has(value)) {
        value = `${base}-${suffix++}`;
    }
    return value;
}
