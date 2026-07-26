import type { ThemeDefinition, ThemeSettings } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { integrationOwnerId, isIntegrationSource } from "../ownership";
import { currentCategory, currentSource, currentTheme } from "./model";
import { renderToken } from "./tokenView";

export type ThemeEditorViewState = {
    settings: ThemeSettings;
    selection: ThemeSelection;
    selectedThemeId: string;
    mode: "light" | "dark";
    siteName: string;
    canPersist: boolean;
};

export function renderThemeEditor(root: ShadowRoot, state: ThemeEditorViewState): "light" | "dark" {
    const source = currentSource(state.settings, state.selection);
    const category = currentCategory(state.settings, state.selection);
    const theme = currentTheme(state.settings, state.selectedThemeId);
    if (!source || !category || !theme) {
        return state.mode;
    }
    query<HTMLElement>(root, "[data-category-title]").textContent = category.label;
    query<HTMLElement>(root, "[data-category-description]").textContent = `${source.label} · ${category.description}`;
    query<HTMLInputElement>(root, "[data-theme-name-input]").value = theme.name;
    query<HTMLInputElement>(root, "[data-category-label-input]").value = category.label;
    query<HTMLTextAreaElement>(root, "[data-category-description-input]").value = category.description;
    query<HTMLElement>(root, "[data-site-name]").textContent = state.siteName
        ? `Editing the appearance of ${state.siteName}.`
        : "Editing the appearance of this site.";

    const select = query<HTMLElement>(root, "[data-theme-switch]") as HTMLElement & { value: string };
    select.replaceChildren(...state.settings.themes.map(themeOption));
    select.value = theme.id;

    const active = theme.id === state.settings.activeThemeId;
    const status = query<HTMLElement>(root, "[data-theme-status]");
    status.textContent = active ? "Active" : "Draft";
    status.setAttribute("color", active ? "success" : "warning");
    query<HTMLElement>(root, "[data-save-theme]").toggleAttribute("disabled", !state.canPersist);
    query<HTMLElement>(root, "[data-activate-theme]").toggleAttribute("disabled", active || !state.canPersist);

    const integrationId = integrationOwnerId(source);
    const catalogEditable = !isIntegrationSource(source);
    query<HTMLElement>(root, "[data-source-provenance]").hidden = !integrationId;
    query<HTMLElement>(root, "[data-source-owner-label]").textContent = integrationId
        ? `Provided by ${source.label} · ${integrationId}`
        : "";
    query<HTMLElement>(root, "[data-category-lock-note]").hidden = catalogEditable;
    query<HTMLInputElement>(root, "[data-category-label-input]").readOnly = !catalogEditable;
    query<HTMLTextAreaElement>(root, "[data-category-description-input]").readOnly = !catalogEditable;
    query<HTMLElement>(root, "[data-add-theme-category]").hidden = !catalogEditable;
    query<HTMLElement>(root, "[data-add-element]").hidden = !catalogEditable;

    const mode = source.supportsModes ? state.mode : "light";
    const modeSwitch = query<HTMLElement>(root, "[data-mode-switch]");
    modeSwitch.hidden = !source.supportsModes;
    for (const button of Array.from(modeSwitch.querySelectorAll<HTMLButtonElement>("[data-mode]"))) {
        button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }

    const section = query<HTMLElement>(root, "[data-category-section]");
    section.setAttribute("heading", category.label);
    section.setAttribute("description", category.description);
    const list = document.createElement("div");
    list.className = "element-list";
    category.tokens.forEach((token) => list.append(renderToken(token, theme, mode, catalogEditable)));
    query<HTMLElement>(root, "[data-groups]").replaceChildren(category.tokens.length ? list : emptyCategory());
    return mode;
}

export function setThemeMessage(root: ShadowRoot | null, message: string, error = false): void {
    const element = root?.querySelector<HTMLElement>("[data-message]");
    if (element) {
        element.textContent = message;
        element.toggleAttribute("data-error", error);
    }
}

function emptyCategory(): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty-category";
    empty.textContent = "This category is ready for its first token.";
    return empty;
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
