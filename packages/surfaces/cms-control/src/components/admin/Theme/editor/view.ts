import type { ThemeDefinition, ThemeSettings, ThemeToken } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { currentCategory, currentSource, currentTheme } from "./model";

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
    category.tokens.forEach((token) => list.append(renderToken(token, theme, mode)));
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

function renderToken(token: ThemeToken, theme: ThemeDefinition, mode: "light" | "dark"): HTMLElement {
    const row = document.createElement("div");
    row.className = "element-row";
    row.dataset.tokenId = token.id;
    const label = document.createElement("div");
    label.className = "element-label";
    const name = document.createElement("input");
    name.className = "token-label-input";
    name.type = "text";
    name.value = token.label;
    name.ariaLabel = `Label for --${token.variable}`;
    name.dataset.tokenLabel = "true";
    const detail = document.createElement("span");
    detail.textContent = `${token.description} · var(--${token.variable})`;
    label.append(name, detail);
    row.append(label, renderControl(token, theme.values[mode]?.[token.id] ?? ""));
    return row;
}

function renderControl(token: ThemeToken, value: string): HTMLElement {
    if (token.type !== "color") {
        return valueInput(value);
    }
    const control = document.createElement("div");
    control.className = "color-control";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
    picker.dataset.valueControl = "true";
    control.append(picker, valueInput(value));
    return control;
}

function valueInput(value: string): HTMLInputElement {
    const input = document.createElement("input");
    input.className = "value-control";
    input.type = "text";
    input.value = value;
    input.dataset.valueControl = "true";
    return input;
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
