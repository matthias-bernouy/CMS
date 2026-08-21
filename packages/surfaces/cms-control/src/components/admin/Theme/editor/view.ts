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
    const valueMode = source.supportsModes ? state.mode : "light";
    renderHeader(root, state, source, theme);
    renderActions(root, state, theme);
    renderMode(root, source, state.mode);

    const section = query<HTMLElement>(root, "[data-category-section]");
    section.setAttribute("heading", category.label);
    section.setAttribute("description", category.description);
    renderTokenExplorer(root, {
        settings: state.settings,
        category,
        theme,
        mode: valueMode,
        catalogEditable,
    });
    return state.mode;
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
    const select = query<ValueElement>(root, "[data-theme-switch]");
    select.setAttribute("value", theme.id);
    select.replaceChildren(...state.settings.themes.map(themeOption));
    select.value = theme.id;
}

function renderActions(root: ShadowRoot, state: ThemeEditorViewState, theme: ThemeDefinition): void {
    const active = theme.id === state.settings.activeThemeId;
    const status = query<HTMLElement>(root, "[data-theme-status]");
    status.textContent = active ? "Active" : "Draft";
    status.setAttribute("color", active ? "success" : "warning");
    query<HTMLElement>(root, "[data-activate-theme]").toggleAttribute("disabled", active);
}

function renderMode(root: ShadowRoot, source: ThemeSource, mode: "light" | "dark"): void {
    const modeSwitch = query<ValueElement>(root, "[data-mode-switch]");
    if (modeSwitch.value !== mode) {
        modeSwitch.value = mode;
    }
    query<HTMLElement>(root, "[data-mode-note]").hidden = source.supportsModes;
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
