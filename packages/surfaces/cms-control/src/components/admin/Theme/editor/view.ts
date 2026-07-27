import type { ThemeDefinition, ThemeSettings, ThemeSource } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { integrationOwnerId, isThemeCatalogEditable } from "../ownership";
import { currentCategory, currentSource, currentTheme } from "./model";
import { renderTokenExplorer, type ThemeTokenFilter } from "./tokens/explorer";

export type ThemeEditorViewState = {
    settings: ThemeSettings;
    selection: ThemeSelection;
    selectedThemeId: string;
    mode: "light" | "dark";
    siteName: string;
    canPersist: boolean;
    tokenFilter: ThemeTokenFilter;
    tokenSearch: string;
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
    renderOwnership(root, source);
    renderCategoryFields(root, category, catalogEditable);
    renderActions(root, state, source, theme, catalogEditable);
    renderModes(root, source, mode);

    const section = query<HTMLElement>(root, "[data-category-section]");
    section.setAttribute("heading", category.label);
    section.setAttribute("description", category.description);
    renderTokenExplorer(root, {
        settings: state.settings,
        source,
        category,
        theme,
        mode,
        catalogEditable,
        filter: state.tokenFilter,
        search: state.tokenSearch,
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
    query<HTMLElement>(root, "[data-category-title]").textContent = source.label;
    query<HTMLInputElement>(root, "[data-theme-name-input]").value = theme.name;
    query<HTMLElement>(root, "[data-site-name]").textContent = state.siteName || "Current site";
    const select = query<HTMLElement>(root, "[data-theme-switch]") as HTMLElement & { value: string };
    select.replaceChildren(...state.settings.themes.map(themeOption));
    select.value = theme.id;
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
    query<HTMLElement>(root, "[data-save-theme]").toggleAttribute("disabled", !state.canPersist);
    query<HTMLElement>(root, "[data-activate-theme]").toggleAttribute("disabled", active || !state.canPersist);
    query<HTMLElement>(root, "[data-add-theme-category]").hidden = !catalogEditable;
    query<HTMLElement>(root, "[data-add-element]").hidden = !catalogEditable;
    const hasDeletionDestination =
        source.categories.length > 1 ||
        state.settings.sources.some(
            (item) => item !== source && isThemeCatalogEditable(item) && item.categories.length > 0,
        );
    const deleteCategory = query<HTMLButtonElement>(root, "[data-delete-category]");
    deleteCategory.hidden = !catalogEditable;
    deleteCategory.disabled = !catalogEditable || !hasDeletionDestination;
    deleteCategory.title = catalogEditable && !hasDeletionDestination ? "Keep at least one editable category." : "";
}

function renderOwnership(root: ShadowRoot, source: ThemeSource): void {
    const integrationId = integrationOwnerId(source);
    const provenance = query<HTMLElement>(root, "[data-source-provenance]");
    provenance.hidden = !integrationId;
    if (!integrationId) {
        return;
    }
    const kind = query<HTMLElement>(root, "[data-source-owner-kind]");
    const label = query<HTMLElement>(root, "[data-source-owner-label]");
    const note = query<HTMLElement>(root, "[data-source-owner-note]");
    kind.textContent = "Integration";
    label.textContent = source.label;
    label.title = integrationId;
    note.textContent = "Structure managed by the integration; token values remain editable.";
}

function renderCategoryFields(root: ShadowRoot, category: ThemeSource["categories"][number], editable: boolean): void {
    query<HTMLElement>(root, "[data-category-fields]").hidden = !editable;
    query<HTMLInputElement>(root, "[data-category-label-input]").value = category.label;
    query<HTMLInputElement>(root, "[data-category-description-input]").value = category.description;
}

function renderModes(root: ShadowRoot, source: ThemeSource, mode: "light" | "dark"): void {
    const modeSwitch = query<HTMLElement>(root, "[data-mode-switch]");
    modeSwitch.hidden = !source.supportsModes;
    for (const button of Array.from(modeSwitch.querySelectorAll<HTMLButtonElement>("[data-mode]"))) {
        button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
}

function themeOption(theme: ThemeDefinition): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    return option;
}

function query<T extends Element>(root: ShadowRoot, selector: string): T {
    return root.querySelector(selector) as T;
}
