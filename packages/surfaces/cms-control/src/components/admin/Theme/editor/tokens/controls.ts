import type { ThemeDefinition, ThemeMode, ThemeSettings, ThemeToken } from "@bernouy/cms-content";

import { parseDirectTokenReference } from "./cssReference";
import { renderManualControl } from "./manualControl";
import { renderReferenceControl } from "./referenceControl";
import { effectiveTokenValue, resolveThemeTokenValue } from "./values";

export function renderTokenControls(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
): HTMLElement {
    const value = effectiveTokenValue(token, theme, mode);
    const resolved = resolveThemeTokenValue(settings, theme, mode, token.id);
    const inputMode = parseDirectTokenReference(value) ? "reference" : "manual";
    const group = document.createElement("div");
    group.className = "token-controls";
    group.dataset.tokenControlMode = inputMode;
    const valueLine = document.createElement("div");
    valueLine.className = "token-value-line";
    const editor = document.createElement("div");
    editor.className = "token-value-editor";
    const manual = renderManualControl(token, manualValue(value, resolved.state, resolved.value));
    const reference = renderReferenceControl(token, settings, theme, mode, value, resolved);
    setEditorActive(manual, inputMode === "manual");
    setEditorActive(reference, inputMode === "reference");
    editor.append(manual, reference);
    valueLine.append(valueModeSwitch(token, inputMode), editor);
    group.append(valueLine);
    if (token.defaults && Object.hasOwn(theme.values[mode] ?? {}, token.id)) {
        group.append(renderReset(token));
    }
    return group;
}

export function setEditorActive(editor: HTMLElement, active: boolean): void {
    editor.hidden = !active;
    editor.querySelectorAll<HTMLElement>("[data-value-editor-control]").forEach((control) => {
        control.toggleAttribute("data-token-value-control", active && !control.hidden);
    });
}

function valueModeSwitch(token: ThemeToken, value: "manual" | "reference"): HTMLElement {
    const switcher = document.createElement("p9r-segmented-switch");
    switcher.className = "token-value-mode";
    switcher.dataset.tokenInputMode = "true";
    switcher.setAttribute("aria-label", `Choose how ${token.label} is defined`);
    switcher.setAttribute("value", value);
    switcher.innerHTML = `<option value="manual">Manual</option><option value="reference">Reference</option>`;
    return switcher;
}

function manualValue(raw: string, state: string, resolved: string): string {
    if (!parseDirectTokenReference(raw)) {
        return raw;
    }
    return state === "resolved" ? resolved : "";
}

function renderReset(token: ThemeToken): HTMLElement {
    const line = document.createElement("div");
    line.className = "token-default";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.dataset.resetToken = token.id;
    reset.textContent = "Reset to default";
    reset.title = "Restore the default value";
    reset.ariaLabel = `Reset ${token.label} to its default`;
    line.append(reset);
    return line;
}
