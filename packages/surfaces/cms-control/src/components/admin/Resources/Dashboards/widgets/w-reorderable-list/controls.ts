import { valueAt } from "../../runtime/expressions";
import type { ReorderableListItem, ReorderableListItemField } from "./state";

type ValueControl = HTMLElement & { value: unknown };

export function createItemControl(
    item: ReorderableListItem,
    index: number,
    field: ReorderableListItemField,
): HTMLElement {
    const input = fieldControl(field, textAt(item, field.path));
    if (input instanceof HTMLInputElement && field.type === "checkbox") {
        input.checked = booleanAt(item, field.path);
    }
    input.dataset.itemIndex = String(index);
    input.dataset.itemPath = field.path;
    input.setAttribute("aria-label", field.label);
    if (field.required) {
        input.setAttribute("required", "");
    }
    if (field.placeholder) {
        input.setAttribute("placeholder", field.placeholder);
    }
    return input;
}

export function readItemControl(control: HTMLElement): string | boolean {
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
        return control.checked;
    }
    return "value" in control ? String((control as ValueControl).value ?? "") : "";
}

function fieldControl(field: ReorderableListItemField, value: string): HTMLElement {
    if (field.type === "select" || field.type === "combobox") {
        const control = document.createElement(field.type === "select" ? "p9r-select" : "p9r-combobox") as ValueControl;
        control.setAttribute("aria-label", field.label);
        control.setAttribute("value", value);
        control.replaceChildren(
            ...(field.options ?? []).map((option) => {
                const element = document.createElement("option");
                element.value = option.value;
                element.textContent = option.label;
                element.selected = option.value === value;
                return element;
            }),
        );
        control.value = value;
        return control;
    }
    const input = document.createElement("input");
    input.type = field.type ?? "text";
    input.value = value;
    return input;
}

function textAt(value: unknown, path: string): string {
    const resolved = valueAt(value, path);
    return resolved === null || resolved === undefined ? "" : String(resolved);
}

function booleanAt(value: unknown, path: string): boolean {
    const resolved = valueAt(value, path);
    return resolved === true || resolved === "true" || resolved === 1;
}
