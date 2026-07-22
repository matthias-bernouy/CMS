import { fieldExpression } from "./fieldMode";
import { selectedSourceConditions } from "./sourceStateMode";
import type { ConditionPickerMode, ConditionPickerSource, FieldConditionDraft } from "./types";

export type ConditionPickerElements = {
    applyButton: HTMLButtonElement;
    backdrop: HTMLElement;
    body: HTMLElement;
    closeButton: HTMLButtonElement;
    removeButton: HTMLButtonElement;
    subtitle: HTMLElement;
};

export function queryConditionPickerElements(root: ShadowRoot): ConditionPickerElements {
    const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
    return {
        applyButton: query(".apply"),
        backdrop: query(".backdrop"),
        body: query(".body"),
        closeButton: query(".close"),
        removeButton: query(".remove"),
        subtitle: query(".subtitle"),
    };
}

export function conditionExpression(input: {
    mode: ConditionPickerMode;
    advancedExpression: string;
    fieldDraft: FieldConditionDraft;
    sources: ConditionPickerSource[];
    selected: Set<string>;
}): string {
    if (input.mode === "advanced") {
        return input.advancedExpression.trim();
    }
    if (input.mode === "field" && input.fieldDraft.path) {
        return fieldExpression(input.fieldDraft);
    }
    return selectedSourceConditions(input.sources, input.selected)
        .map((condition) => `${condition.sourceEditor.target.localName}.${condition.sourceState}`)
        .join(" || ");
}

export function renderConditionModes(
    activeMode: ConditionPickerMode,
    onSelect: (mode: ConditionPickerMode) => void,
): HTMLElement {
    const group = document.createElement("div");
    group.className = "modes";
    group.append(
        modeButton("source", "Source state", activeMode, onSelect),
        modeButton("field", "Data field", activeMode, onSelect),
        modeButton("advanced", "Advanced", activeMode, onSelect),
    );
    return group;
}

export function renderConditionSummary(expression: string): HTMLElement {
    const summary = document.createElement("div");
    summary.className = "summary";
    summary.append(...conditionSummaryParts(expression));
    return summary;
}

export function conditionSummaryParts(expression: string): [HTMLElement, HTMLElement] {
    const label = document.createElement("span");
    label.textContent = "Expression";
    const code = document.createElement("code");
    code.textContent = expression || "No condition selected.";
    return [label, code];
}

function modeButton(
    mode: ConditionPickerMode,
    label: string,
    activeMode: ConditionPickerMode,
    onSelect: (mode: ConditionPickerMode) => void,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(activeMode === mode));
    button.addEventListener("click", () => onSelect(mode));
    return button;
}
