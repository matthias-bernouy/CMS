import type { ThemeSettings } from "@bernouy/cms-content";

import { dispatchThemeCategoryUpdated, type ThemeSelection } from "../events";
import { currentCategory, currentSource, currentTheme } from "./model";

export type ThemeInputContext = {
    root: ShadowRoot;
    settings: ThemeSettings;
    selection: ThemeSelection;
    selectedThemeId: string;
    mode: "light" | "dark";
};

export function handleThemeInput(event: Event, context: ThemeInputContext): void {
    const input = event.target as HTMLInputElement | null;
    const theme = currentTheme(context.settings, context.selectedThemeId);
    if (!input || !theme) {
        return;
    }
    if (input.matches("[data-theme-name-input]")) {
        theme.name = input.value;
        return;
    }
    const category = currentCategory(context.settings, context.selection);
    const source = currentSource(context.settings, context.selection);
    if (input.matches("[data-category-label-input]") && category && source) {
        category.label = input.value;
        query<HTMLElement>(context.root, "[data-category-title]").textContent = category.label;
        query<HTMLElement>(context.root, "[data-category-section]").setAttribute("heading", category.label);
        dispatchThemeCategoryUpdated({ sourceId: source.id, category });
        return;
    }
    if (input.matches("[data-category-description-input]") && category && source) {
        category.description = input.value;
        query<HTMLElement>(context.root, "[data-category-section]").setAttribute("description", category.description);
        query<HTMLElement>(context.root, "[data-category-description]").textContent =
            `${source.label} · ${category.description}`;
        dispatchThemeCategoryUpdated({ sourceId: source.id, category });
        return;
    }
    if (input.matches("[data-token-label]")) {
        const tokenId = input.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;
        const token = category?.tokens.find((item) => item.id === tokenId);
        if (token) {
            token.label = input.value;
        }
        return;
    }
    if (!input.matches("[data-value-control]")) {
        return;
    }
    const tokenId = input.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;
    if (!tokenId) {
        return;
    }
    theme.values[context.mode] ??= {};
    theme.values[context.mode][tokenId] = input.value;
    if (input.type === "color") {
        const text = input
            .closest<HTMLElement>("[data-token-id]")
            ?.querySelector<HTMLInputElement>('input[type="text"]');
        if (text) {
            text.value = input.value;
        }
    }
}

export function clickAction(event: Event): "theme" | "category" | "token" | "save" | "activate" | undefined {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-add-theme]")) {
        return "theme";
    }
    if (target?.closest("[data-add-theme-category]")) {
        return "category";
    }
    if (target?.closest("[data-add-element]")) {
        return "token";
    }
    if (target?.closest("[data-save-theme]")) {
        return "save";
    }
    if (target?.closest("[data-activate-theme]")) {
        return "activate";
    }
    return undefined;
}

function query<T extends Element>(root: ShadowRoot, selector: string): T {
    return root.querySelector(selector) as T;
}
