import type { ThemeSettings } from "@bernouy/cms-content";

import type { ThemeSelection } from "../../events";
import { currentTheme, resetTokenValue } from "../model";
import { setEditorActive } from "../tokens/controls";

export type ThemeInputContext = {
    root: ShadowRoot;
    settings: ThemeSettings;
    selection: ThemeSelection;
    selectedThemeId: string;
    mode: "light" | "dark";
};

type ThemeValueControl = HTMLElement & { type?: string; value: string };

export function handleThemeInput(event: Event, context: ThemeInputContext): void {
    const input = event.target as ThemeValueControl | null;
    const theme = currentTheme(context.settings, context.selectedThemeId);
    if (!input || !theme) {
        return;
    }
    const tokenValueControl = input.matches("[data-token-value-control]");
    const lengthControl = input.matches("[data-length-number], [data-length-unit]");
    if (!input.matches("[data-value-control]") && !tokenValueControl && !lengthControl) {
        return;
    }
    if (tokenValueControl && event.type !== "change") {
        return;
    }
    const tokenId = input.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;
    if (!tokenId) {
        return;
    }
    const value = lengthControl ? lengthValue(input) : input.value;
    if (value === undefined) {
        return;
    }
    theme.values[context.mode] ??= {};
    theme.values[context.mode][tokenId] = value;
    if (input.type === "color") {
        const text = input
            .closest<HTMLElement>("[data-token-id]")
            ?.querySelector<ThemeValueControl>("[data-token-value-control]");
        if (text) {
            text.value = input.value;
            text.setAttribute("value", input.value);
        }
    }
}

export function handleTokenControlMode(event: Event): boolean {
    const switcher = event.target as ThemeValueControl | null;
    if (
        !switcher?.matches("[data-token-input-mode]") ||
        (switcher.value !== "manual" && switcher.value !== "reference")
    ) {
        return false;
    }
    const controls = switcher.closest<HTMLElement>("[data-token-control-mode]");
    if (!controls) {
        return false;
    }
    controls.dataset.tokenControlMode = switcher.value;
    setEditorActive(controls.querySelector<HTMLElement>("[data-manual-editor]")!, switcher.value === "manual");
    setEditorActive(controls.querySelector<HTMLElement>("[data-reference-editor]")!, switcher.value === "reference");
    queueMicrotask(() => {
        controls.querySelector<HTMLElement>("[data-token-value-control]")?.focus();
    });
    return true;
}

export function handleLengthControlMode(event: Event): boolean {
    const unit = event.target as ThemeValueControl | null;
    if (!unit?.matches("[data-length-unit]")) {
        return false;
    }
    const editor = unit.closest<HTMLElement>(".length-editor");
    const number = editor?.querySelector<HTMLElement>("[data-length-number]");
    const expression = editor?.querySelector<HTMLElement>("[data-length-expression]");
    if (!number || !expression) {
        return false;
    }
    const advanced = unit.value === "advanced";
    number.hidden = advanced;
    expression.hidden = !advanced;
    expression.toggleAttribute("data-token-value-control", advanced);
    if (advanced) {
        expression.focus();
    } else {
        const numberControl = number as ThemeValueControl;
        if (!numberControl.value.trim()) {
            numberControl.value = "0";
            numberControl.setAttribute("value", "0");
        }
        numberControl.focus();
    }
    return advanced;
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
    return tokenId ? resetTokenValue(settings, selection, selectedThemeId, mode, tokenId) : false;
}

export function clickAction(
    event: Event,
):
    | "theme"
    | "edit-theme"
    | "close-context"
    | "edit-token"
    | "close-variable-edit"
    | "delete-token"
    | "save"
    | "activate"
    | undefined {
    const target = event.target as HTMLElement | null;
    const actions = [
        "theme",
        "edit-theme",
        "close-context",
        "edit-token",
        "close-variable-edit",
        "delete-token",
        "save",
        "activate",
    ] as const;
    const selectors = [
        "[data-add-theme]",
        "[data-edit-theme]",
        "[data-context-cancel]",
        "[data-edit-token]",
        "[data-variable-edit-cancel]",
        "[data-delete-token]",
        "[data-save-theme]",
        "[data-activate-theme]",
    ];
    return actions.find((_, index) => target?.closest(selectors[index]!));
}

function lengthValue(input: ThemeValueControl): string | undefined {
    const editor = input.closest<HTMLElement>(".length-editor");
    const number = editor?.querySelector<ThemeValueControl>("[data-length-number]")?.value.trim();
    const unit = editor?.querySelector<ThemeValueControl>("[data-length-unit]")?.value;
    return number !== undefined && unit !== undefined && unit !== "advanced" ? `${number}${unit}` : undefined;
}
