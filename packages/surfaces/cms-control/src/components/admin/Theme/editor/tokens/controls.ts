import type { ThemeDefinition, ThemeMode, ThemeSettings, ThemeToken, ThemeTokenType } from "@bernouy/cms-content";

import { directTokenReference } from "./cssReference";
import { effectiveTokenValue, resolveThemeTokenValue } from "./values";

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
    valueLine.append(renderControl(token, settings, theme, value, mode), referenceButton(token, value));
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
        return valueInput(token, value);
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
    control.append(picker, valueInput(token, value));
    return control;
}

function valueInput(token: ThemeToken, value: string): HTMLInputElement {
    const input = document.createElement("input");
    input.className = `value-control ${token.type}-control`;
    input.type = "text";
    input.value = value;
    input.dataset.valueControl = "true";
    input.ariaLabel = `${token.label} ${controlLabel(token.type)}`;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.inputMode = token.type === "number" ? "decimal" : "text";
    input.placeholder = placeholderFor(token.type);
    return input;
}

function referenceButton(token: ThemeToken, value: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "reference-button";
    button.type = "button";
    button.dataset.openTokenReference = token.id;
    button.textContent = directTokenReference(value) ? "Change link" : "Link token";
    button.ariaLabel = `Link ${token.label} to another token`;
    return button;
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
    if (resolved.state === "resolved" && resolved.reference) {
        status.textContent = `Linked to ${resolved.reference.token.label} · resolves to ${resolved.value}`;
    } else if (resolved.state === "cycle") {
        status.dataset.error = "true";
        status.textContent = "Circular token reference. Choose a different token before saving.";
    } else if (resolved.state === "missing") {
        status.dataset.error = "true";
        status.textContent = "This value references a token that is not available.";
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
