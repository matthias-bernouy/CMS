import type { ThemeDefinition, ThemeMode, ThemeSettings, ThemeToken, ThemeTokenType } from "@bernouy/cms-content";

import {
    canReferenceThemeToken,
    effectiveTokenValue,
    resolveThemeTokenValue,
    type ResolvedThemeValue,
    themeTokenEntries,
} from "./values";

type TokenValueControl = HTMLElement & { value: string };

export function renderTokenControls(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
): HTMLElement {
    const value = effectiveTokenValue(token, theme, mode);
    const group = document.createElement("div");
    group.className = "token-controls";
    const valueLine = document.createElement("div");
    valueLine.className = "token-value-line";
    const resolved = resolveThemeTokenValue(settings, theme, mode, token.id);
    valueLine.append(renderControl(token, settings, theme, value, mode, resolved));
    group.append(valueLine);
    if (token.defaults && Object.hasOwn(theme.values[mode] ?? {}, token.id)) {
        group.append(renderReset(token, mode));
    }
    return group;
}

function renderControl(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    value: string,
    mode: ThemeMode,
    resolved: ResolvedThemeValue,
): HTMLElement {
    if (token.type !== "color") {
        return valueCombobox(token, settings, theme, mode, value, resolved);
    }
    const control = document.createElement("div");
    control.className = "color-control";
    const picker = document.createElement("input");
    const hasPreview = /^#[0-9a-f]{6}$/i.test(resolved.value);
    picker.type = "color";
    picker.value = hasPreview ? resolved.value : "#000000";
    picker.hidden = !hasPreview;
    picker.dataset.valueControl = "true";
    picker.ariaLabel = `${token.label} color picker`;
    control.append(picker, valueCombobox(token, settings, theme, mode, value, resolved));
    return control;
}

function valueCombobox(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
    value: string,
    resolved: ResolvedThemeValue,
): TokenValueControl {
    const input = document.createElement("p9r-combobox") as TokenValueControl;
    input.className = `value-control ${token.type}-control`;
    input.dataset.tokenValueControl = "true";
    input.setAttribute("aria-label", `${token.label} ${controlLabel(token.type)}`);
    input.setAttribute("creatable", "");
    input.setAttribute("placeholder", placeholderFor(token.type));
    input.replaceChildren(...referenceOptions(token, settings, theme, mode));
    input.setAttribute("value", value);
    input.value = value;
    const error = referenceError(resolved);
    if (error) {
        input.setAttribute("invalid", "");
        input.setAttribute("hint", error);
        input.setAttribute("hint-level", "error");
    }
    return input;
}

function referenceOptions(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
): HTMLOptionElement[] {
    return themeTokenEntries(settings)
        .filter((entry) => canReferenceThemeToken(settings, theme, mode, token.id, entry.token.id))
        .map((entry) => {
            const option = document.createElement("option");
            option.value = `var(--${entry.token.variable})`;
            option.textContent = `${entry.source.label} · ${entry.category.label} · ${entry.token.label} · --${entry.token.variable}`;
            return option;
        });
}

function referenceError(resolved: ResolvedThemeValue): string | undefined {
    if (resolved.state === "cycle") {
        return "Circular token reference. Choose a different token before saving.";
    }
    return resolved.state === "missing" ? "This value references a token that is not available." : undefined;
}

function renderReset(token: ThemeToken, mode: ThemeMode): HTMLElement {
    const line = document.createElement("div");
    line.className = "token-default";
    const expected = token.defaults?.[mode];
    const reset = document.createElement("button");
    reset.type = "button";
    reset.dataset.resetToken = token.id;
    reset.textContent = "Reset to default";
    reset.title = expected === undefined ? "Inherits the light value" : expected;
    reset.ariaLabel = `Reset ${token.label} to its default`;
    line.append(reset);
    return line;
}

function controlLabel(type: ThemeTokenType): string {
    return type === "font-family" ? "font family" : `${type} CSS value`;
}

function placeholderFor(type: ThemeTokenType): string {
    const examples: Partial<Record<ThemeTokenType, string>> = {
        "font-family": "Inter, system-ui, sans-serif",
        length: "1rem",
        number: "1",
        shadow: "0 2px 8px rgb(0 0 0 / 10%)",
    };
    return examples[type] ?? "CSS value";
}
