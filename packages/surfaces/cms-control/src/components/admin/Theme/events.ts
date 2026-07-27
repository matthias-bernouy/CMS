import type { ThemeCategory, ThemeSource } from "@bernouy/cms-content";

export const THEME_CATEGORY_SELECTED_EVENT = "cms:theme-category-selected";
export const THEME_CATEGORY_ADDED_EVENT = "cms:theme-category-added";
export const THEME_CATEGORY_DELETED_EVENT = "cms:theme-category-deleted";
export const THEME_CATEGORY_UPDATED_EVENT = "cms:theme-category-updated";
export const THEME_SETTINGS_REFRESHED_EVENT = "cms:theme-settings-refreshed";

export type ThemeSelection = {
    sourceId: string;
    categoryId: string;
};

export type ThemeCategoryAdded = {
    sourceId: string;
    category: ThemeCategory;
};

export type ThemeCategoryDeleted = {
    sourceId: string;
    categoryId: string;
    sourceRemoved: boolean;
    selection: ThemeSelection;
};

export function themeSelectionFromUrl(sources: ThemeSource[]): ThemeSelection {
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

export function dispatchThemeCategorySelected(selection: ThemeSelection): void {
    window.dispatchEvent(new CustomEvent<ThemeSelection>(THEME_CATEGORY_SELECTED_EVENT, { detail: selection }));
}

export function dispatchThemeCategoryAdded(detail: ThemeCategoryAdded): void {
    window.dispatchEvent(new CustomEvent<ThemeCategoryAdded>(THEME_CATEGORY_ADDED_EVENT, { detail }));
}

export function dispatchThemeCategoryDeleted(detail: ThemeCategoryDeleted): void {
    window.dispatchEvent(new CustomEvent<ThemeCategoryDeleted>(THEME_CATEGORY_DELETED_EVENT, { detail }));
}

export function dispatchThemeCategoryUpdated(detail: ThemeCategoryAdded): void {
    window.dispatchEvent(new CustomEvent<ThemeCategoryAdded>(THEME_CATEGORY_UPDATED_EVENT, { detail }));
}

export function dispatchThemeSettingsRefreshed(): void {
    window.dispatchEvent(new Event(THEME_SETTINGS_REFRESHED_EVENT));
}
