import type { ThemeSettings, ThemeTokenType } from "@bernouy/cms-content";

import { dispatchThemeCategoryUpdated, type ThemeSelection } from "../../events";
import { isThemeCatalogEditable } from "../../ownership";
import { currentCategory, currentSource, currentTheme, resetIntegrationTokenValue } from "../model";

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
    const catalogEditable = isThemeCatalogEditable(source);
    if (input.matches("[data-category-label-input]") && category && source && catalogEditable) {
        category.label = input.value;
        query<HTMLElement>(context.root, "[data-category-title]").textContent = category.label;
        query<HTMLElement>(context.root, "[data-category-section]").setAttribute("heading", category.label);
        dispatchThemeCategoryUpdated({ sourceId: source.id, category });
        return;
    }
    if (input.matches("[data-category-description-input]") && category && source && catalogEditable) {
        category.description = input.value;
        query<HTMLElement>(context.root, "[data-category-section]").setAttribute("description", category.description);
        dispatchThemeCategoryUpdated({ sourceId: source.id, category });
        return;
    }
    if (input.matches("[data-token-label]") && catalogEditable) {
        updateToken(context, input, (token) => {
            token.label = input.value;
        });
        return;
    }
    if (input.matches("[data-token-description]") && catalogEditable) {
        updateToken(context, input, (token) => {
            token.description = input.value;
        });
        return;
    }
    if (input.matches("[data-token-type-control]") && catalogEditable && isTokenType(input.value)) {
        updateToken(context, input, (token) => {
            token.type = input.value as ThemeTokenType;
        });
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
            ?.querySelector<HTMLInputElement>('input.value-control[type="text"]');
        if (text) {
            text.value = input.value;
        }
    }
}

export function resetThemeToken(
    event: Event,
    settings: ThemeSettings,
    selection: ThemeSelection,
    selectedThemeId: string,
    mode: "light" | "dark",
): boolean {
    const tokenId = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-reset-token]")?.dataset
        .resetToken;
    return tokenId ? resetIntegrationTokenValue(settings, selection, selectedThemeId, mode, tokenId) : false;
}

export function clickAction(
    event: Event,
): "theme" | "category" | "token" | "delete-category" | "delete-token" | "save" | "activate" | undefined {
    const target = event.target as HTMLElement | null;
    const actions = ["theme", "category", "token", "delete-category", "delete-token", "save", "activate"] as const;
    const selectors = [
        "[data-add-theme]",
        "[data-add-theme-category]",
        "[data-add-element]",
        "[data-delete-category]",
        "[data-delete-token]",
        "[data-save-theme]",
        "[data-activate-theme]",
    ];
    return actions.find((_, index) => target?.closest(selectors[index]!));
}

function updateToken(
    context: ThemeInputContext,
    input: HTMLInputElement,
    update: (token: ThemeSettings["sources"][number]["categories"][number]["tokens"][number]) => void,
): void {
    const tokenId = input.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;
    const source = currentSource(context.settings, context.selection);
    const token = source?.categories.flatMap((item) => item.tokens).find((item) => item.id === tokenId);
    if (token) {
        update(token);
    }
}

function isTokenType(value: string): value is ThemeTokenType {
    return ["color", "font-family", "length", "number", "shadow", "value"].includes(value);
}

function query<T extends Element>(root: ShadowRoot, selector: string): T {
    return root.querySelector(selector) as T;
}
