import type { ThemeDefinition, ThemeMode, ThemeSettings, ThemeToken, ThemeTokenType } from "@bernouy/cms-content";

import { canReferenceThemeToken, effectiveTokenValue, resolveThemeTokenValue, themeTokenEntries } from "./values";

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
    valueLine.append(renderControl(token, settings, theme, value, mode));
    group.append(valueLine, referenceStatus(token, settings, theme, mode));
    if (token.defaults) {
        group.append(renderDefault(token, mode, Object.hasOwn(theme.values[mode] ?? {}, token.id)));
    }
    return group;
}

function renderControl(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    value: string,
    mode: ThemeMode,
): HTMLElement {
    if (token.type !== "color") {
        return valueCombobox(token, settings, theme, mode, value);
    }
    const control = document.createElement("div");
    control.className = "color-control";
    const picker = document.createElement("input");
    const resolved = resolveThemeTokenValue(settings, theme, mode, token.id).value;
    const hasPreview = /^#[0-9a-f]{6}$/i.test(resolved);
    picker.type = "color";
    picker.value = hasPreview ? resolved : "#000000";
    picker.hidden = !hasPreview;
    picker.dataset.valueControl = "true";
    picker.ariaLabel = `${token.label} color picker`;
    control.append(picker, valueCombobox(token, settings, theme, mode, value));
    return control;
}

function valueCombobox(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
    value: string,
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

function referenceStatus(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
): HTMLElement {
    const status = document.createElement("p");
    status.className = "reference-status";
    const resolved = resolveThemeTokenValue(settings, theme, mode, token.id);
    if (resolved.state === "cycle") {
        status.dataset.error = "true";
        status.textContent = "Circular token reference. Choose a different token before saving.";
    } else if (resolved.state === "missing") {
        status.dataset.error = "true";
        status.textContent = "This value references a token that is not available.";
    } else if (resolved.state === "resolved" && resolved.reference) {
        status.textContent = `Uses ${resolved.reference.token.label} · ${resolved.value}`;
    } else {
        status.hidden = true;
    }
    return status;
}

function renderDefault(token: ThemeToken, mode: ThemeMode, overridden: boolean): HTMLElement {
    const line = document.createElement("div");
    line.className = "token-default";
    const expected = token.defaults?.[mode];
    const text = document.createElement("span");
    text.textContent = expected === undefined ? "Default: inherits the light value" : `Default: ${expected}`;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.dataset.resetToken = token.id;
    reset.textContent = "Reset";
    reset.disabled = !overridden;
    reset.ariaLabel = `Reset ${token.label} to its integration default`;
    line.append(text, reset);
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
