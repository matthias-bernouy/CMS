import type { ThemeDefinition, ThemeSettings, ThemeSource } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { isThemeCatalogEditable } from "../ownership";
import { currentCategory, currentSource, currentTheme } from "./model";
import { renderTokenExplorer } from "./tokens/explorer";

export type ThemeEditorViewState = {
    settings: ThemeSettings;
    selection: ThemeSelection;
    selectedThemeId: string;
    mode: "light" | "dark";
};

export function renderThemeEditor(root: ShadowRoot, state: ThemeEditorViewState): "light" | "dark" {
    const source = currentSource(state.settings, state.selection);
    const category = currentCategory(state.settings, state.selection);
    const theme = currentTheme(state.settings, state.selectedThemeId);
    if (!source || !category || !theme) {
        return state.mode;
    }
    const catalogEditable = isThemeCatalogEditable(source);
    const mode = source.supportsModes ? state.mode : "light";
    renderHeader(root, state, source, theme);
    renderActions(root, state, source, theme, catalogEditable);
    renderModes(root, source, mode);
    renderCategoryFields(root, category, catalogEditable);

    const section = query<HTMLElement>(root, "[data-category-section]");
    section.setAttribute("heading", category.label);
    section.setAttribute("description", category.description);
    renderTokenExplorer(root, {
        settings: state.settings,
        category,
        theme,
        mode,
        catalogEditable,
    });
    return mode;
}

export function setThemeMessage(root: ShadowRoot | null, message: string, error = false): void {
    const element = root?.querySelector<HTMLElement>("[data-message]");
    if (element) {
        element.textContent = message;
        element.toggleAttribute("data-error", error);
    }
}

function renderHeader(
    root: ShadowRoot,
    state: ThemeEditorViewState,
    source: ThemeSource,
    theme: ThemeDefinition,
): void {
    query<HTMLElement>(root, "[data-source-title]").textContent = source.label;
    query<HTMLInputElement>(root, "[data-theme-name-input]").value = theme.name;
    const select = query<ValueElement>(root, "[data-theme-switch]");
    select.setAttribute("value", theme.id);
    select.replaceChildren(...state.settings.themes.map(themeOption));
    select.value = theme.id;
    select.hidden = state.settings.themes.length < 2;
}

function renderActions(
    root: ShadowRoot,
    state: ThemeEditorViewState,
    source: ThemeSource,
    theme: ThemeDefinition,
    catalogEditable: boolean,
): void {
    const active = theme.id === state.settings.activeThemeId;
    const status = query<HTMLElement>(root, "[data-theme-status]");
    status.textContent = active ? "Active" : "Draft";
    status.setAttribute("color", active ? "success" : "warning");
    query<HTMLElement>(root, "[data-activate-theme]").toggleAttribute("disabled", active);
    query<HTMLElement>(root, "[data-category-actions]").hidden = !catalogEditable;
    query<HTMLElement>(root, "[data-editor-context]").hidden = !catalogEditable && !source.supportsModes;

    const hasDeletionDestination =
        source.categories.length > 1 ||
        state.settings.sources.some(
            (item) => item !== source && isThemeCatalogEditable(item) && item.categories.length > 0,
        );
    const deleteCategory = query<HTMLElement>(root, "[data-delete-category]");
    deleteCategory.toggleAttribute("disabled", !hasDeletionDestination);
    deleteCategory.title = hasDeletionDestination ? "" : "Keep at least one editable group.";
}

function renderCategoryFields(root: ShadowRoot, category: ThemeSource["categories"][number], editable: boolean): void {
    query<HTMLElement>(root, "[data-category-fields]").hidden = !editable;
    query<HTMLInputElement>(root, "[data-category-label-input]").value = category.label;
    query<HTMLInputElement>(root, "[data-category-description-input]").value = category.description;
}

function renderModes(root: ShadowRoot, source: ThemeSource, mode: "light" | "dark"): void {
    const modeSwitch = query<ValueElement>(root, "[data-mode-switch]");
    modeSwitch.hidden = !source.supportsModes;
    if (source.supportsModes && modeSwitch.value !== mode) {
        modeSwitch.value = mode;
    }
}

function themeOption(theme: ThemeDefinition): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    return option;
}

type ValueElement = HTMLElement & { value: string };

function query<T extends Element>(root: ShadowRoot, selector: string): T {
    return root.querySelector(selector) as T;
}
