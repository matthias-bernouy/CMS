import type { ThemeDefinition, ThemeMode, ThemeSettings, ThemeToken } from "@bernouy/cms-content";

import { parseDirectTokenReference } from "./cssReference";
import { canReferenceThemeToken, type ResolvedThemeValue, type ThemeTokenEntry, themeTokenEntries } from "./values";

type ValueControl = HTMLElement & { value: string };

export function renderReferenceControl(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
    value: string,
    resolved: ResolvedThemeValue,
): HTMLElement {
    const editor = document.createElement("div");
    editor.className = "token-editor-panel reference-editor";
    editor.dataset.referenceEditor = "true";
    const input = document.createElement("p9r-combobox") as ValueControl;
    input.className = "value-control reference-control";
    input.dataset.valueEditorControl = "true";
    input.setAttribute("aria-label", `Reference for ${token.label}`);
    input.setAttribute("placeholder", "Select a variable");
    const entries = themeTokenEntries(settings);
    const options = referenceEntries(token, settings, theme, mode, entries);
    input.append(...options.map(referenceOption));
    const reference = parseDirectTokenReference(value);
    if (reference) {
        const current = entries.find((entry) => entry.token.variable === reference.variable);
        if (!options.some((entry) => `var(--${entry.token.variable})` === value)) {
            input.prepend(currentReferenceOption(value, current));
        }
        input.setAttribute("value", value);
        input.value = value;
    } else if (options.length === 0) {
        input.setAttribute("disabled", "");
        input.setAttribute("placeholder", "No compatible variables");
    }
    const error = referenceError(resolved);
    if (error) {
        input.setAttribute("invalid", "");
        input.setAttribute("hint", error);
        input.setAttribute("hint-level", "error");
    }
    editor.append(input);
    return editor;
}

function referenceEntries(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
    entries: ThemeTokenEntry[],
): ThemeTokenEntry[] {
    return entries.filter((entry) => canReferenceThemeToken(settings, theme, mode, token.id, entry.token.id));
}

function referenceOption(entry: ThemeTokenEntry): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = `var(--${entry.token.variable})`;
    option.textContent = referenceLabel(entry);
    return option;
}

function currentReferenceOption(value: string, entry: ThemeTokenEntry | undefined): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = entry ? referenceLabel(entry) : "Unavailable reference";
    return option;
}

function referenceLabel(entry: ThemeTokenEntry): string {
    return `${entry.source.label} · ${entry.category.label} · ${entry.token.label}`;
}

function referenceError(resolved: ResolvedThemeValue): string | undefined {
    if (resolved.state === "cycle") {
        return "Circular reference. Choose a different variable before saving.";
    }
    return resolved.state === "missing" ? "This reference is no longer available." : undefined;
}
