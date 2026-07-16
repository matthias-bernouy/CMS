import type { ThemeCategory } from "@bernouy/cms-content";

export const THEME_CATEGORY_SELECTED_EVENT = "cms:theme-category-selected";
export const THEME_CATEGORY_ADDED_EVENT = "cms:theme-category-added";
export const THEME_CATEGORY_UPDATED_EVENT = "cms:theme-category-updated";
export const THEME_SETTINGS_CHANGED_EVENT = "cms:theme-settings-changed";

export type ThemeSelection = {
    sourceId: string;
    categoryId: string;
};

export type ThemeCategoryAdded = {
    sourceId: string;
    category: ThemeCategory;
};

export function dispatchThemeCategorySelected(selection: ThemeSelection): void {
    window.dispatchEvent(new CustomEvent<ThemeSelection>(THEME_CATEGORY_SELECTED_EVENT, { detail: selection }));
}

export function dispatchThemeCategoryAdded(detail: ThemeCategoryAdded): void {
    window.dispatchEvent(new CustomEvent<ThemeCategoryAdded>(THEME_CATEGORY_ADDED_EVENT, { detail }));
}

export function dispatchThemeCategoryUpdated(detail: ThemeCategoryAdded): void {
    window.dispatchEvent(new CustomEvent<ThemeCategoryAdded>(THEME_CATEGORY_UPDATED_EVENT, { detail }));
}

export function dispatchThemeSettingsChanged(): void {
    window.dispatchEvent(new CustomEvent(THEME_SETTINGS_CHANGED_EVENT));
}
