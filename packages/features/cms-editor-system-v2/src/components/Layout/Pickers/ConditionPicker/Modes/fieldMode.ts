import {
    asFieldCondition,
    type CmsConditionFieldOperator,
    type CmsConditionLiteral,
} from "@bernouy/cms-content/editor";
import type { ConditionFieldOption, FieldConditionDraft } from "./types";

const OPERATORS: Array<{ value: CmsConditionFieldOperator; label: string; needsValue: boolean }> = [
    { value: "truthy", label: "is true / present", needsValue: false },
    { value: "falsy", label: "is false / missing", needsValue: false },
    { value: "equals", label: "equals", needsValue: true },
    { value: "notEquals", label: "does not equal", needsValue: true },
    { value: "greaterThan", label: "is greater than", needsValue: true },
    { value: "greaterThanOrEqual", label: "is at least", needsValue: true },
    { value: "lessThan", label: "is less than", needsValue: true },
    { value: "lessThanOrEqual", label: "is at most", needsValue: true },
    { value: "empty", label: "is empty", needsValue: false },
    { value: "notEmpty", label: "is not empty", needsValue: false },
];

export function renderFieldMode(
    fields: ConditionFieldOption[],
    draft: FieldConditionDraft,
    onChange: (render: boolean) => void,
): HTMLElement {
    const root = document.createElement("div");
    root.className = "mode-panel form-grid";
    if (fields.length === 0) {
        root.append(empty("No data field available."));
        return root;
    }
    root.append(fieldSelect(fields, draft, onChange), operatorSelect(draft, onChange));
    if (operatorNeedsValue(draft.operator)) {
        root.append(valueInput(draft, onChange));
    }
    return root;
}

export function fieldExpression(draft: FieldConditionDraft): string {
    return asFieldCondition(draft.path, draft.operator, parseValue(draft.value));
}

export function defaultFieldDraft(fields: ConditionFieldOption[]): FieldConditionDraft {
    return { path: fields[0]?.path ?? "", operator: "truthy", value: "" };
}

function fieldSelect(
    fields: ConditionFieldOption[],
    draft: FieldConditionDraft,
    onChange: (render: boolean) => void,
): HTMLElement {
    const select = document.createElement("select");
    select.className = "field-path";
    for (const field of fields) {
        const option = document.createElement("option");
        option.value = field.path;
        option.textContent = `${field.scopeLabel}: ${field.path}`;
        select.append(option);
    }
    select.selectedIndex = Math.max(
        0,
        fields.findIndex((field) => field.path === draft.path),
    );
    select.addEventListener("change", () => {
        draft.path = select.options.item(select.selectedIndex)?.value ?? "";
        onChange(false);
    });
    return control("Field", select);
}

function operatorSelect(draft: FieldConditionDraft, onChange: (render: boolean) => void): HTMLElement {
    const select = document.createElement("select");
    select.className = "field-operator";
    for (const operator of OPERATORS) {
        const option = document.createElement("option");
        option.value = operator.value;
        option.textContent = operator.label;
        select.append(option);
    }
    select.selectedIndex = Math.max(
        0,
        OPERATORS.findIndex((operator) => operator.value === draft.operator),
    );
    select.addEventListener("change", () => {
        draft.operator = (select.options.item(select.selectedIndex)?.value ?? "truthy") as CmsConditionFieldOperator;
        onChange(true);
    });
    return control("Operator", select);
}

function valueInput(draft: FieldConditionDraft, onChange: (render: boolean) => void): HTMLElement {
    const input = document.createElement("input");
    input.className = "field-value";
    input.placeholder = "Value";
    input.value = draft.value;
    input.addEventListener("input", () => {
        draft.value = input.value;
        onChange(false);
    });
    return control("Value", input);
}

function operatorNeedsValue(operator: CmsConditionFieldOperator): boolean {
    return OPERATORS.find((candidate) => candidate.value === operator)?.needsValue === true;
}

function control(labelText: string, controlElement: HTMLElement): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "control";
    const text = document.createElement("span");
    text.textContent = labelText;
    wrapper.append(text, controlElement);
    return wrapper;
}

function parseValue(value: string): CmsConditionLiteral {
    const trimmed = value.trim();
    if (trimmed === "true") {
        return true;
    }
    if (trimmed === "false") {
        return false;
    }
    if (trimmed === "null") {
        return null;
    }
    if (trimmed && Number.isFinite(Number(trimmed))) {
        return Number(trimmed);
    }
    return trimmed;
}

function empty(text: string): HTMLElement {
    const element = document.createElement("div");
    element.className = "empty";
    element.textContent = text;
    return element;
}
