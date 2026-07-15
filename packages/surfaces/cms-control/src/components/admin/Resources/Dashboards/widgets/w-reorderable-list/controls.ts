import { valueAt } from "../../runtime/expressions";
import { optionElement, type ValueControl } from "../w-detail/controls/shared";
import type { ReorderableListItem, ReorderableListItemField } from "./state";

export function createItemControl(
    item: ReorderableListItem,
    index: number,
    field: ReorderableListItemField,
): HTMLElement {
    const value = valueAt(item, field.path);
    const control = field.type === "checkbox"
        ? checkbox(value)
        : field.type === "select"
            ? select(field, value)
            : field.type === "combobox"
                ? combobox(field, value)
                : textInput(value);
    control.dataset.itemIndex = String(index);
    control.dataset.itemPath = field.path;
    control.dataset.itemField = field.id;
    control.setAttribute("aria-label", field.label);
    if (field.required) control.setAttribute("required", "");
    if (field.placeholder) control.setAttribute("placeholder", field.placeholder);
    return control;
}

export function readItemControl(field: ReorderableListItemField, control: HTMLElement): unknown {
    if (field.type === "checkbox" && control instanceof HTMLInputElement) return control.checked;
    return "value" in control ? (control as ValueControl).value : "";
}

function textInput(value: unknown): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.value = textValue(value);
    return input;
}

function checkbox(value: unknown): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value === true;
    return input;
}

function select(
    field: Extract<ReorderableListItemField, { type: "select" }>,
    value: unknown,
): ValueControl {
    const input = document.createElement("p9r-select") as ValueControl;
    const text = textValue(value);
    input.setAttribute("value", text);
    input.replaceChildren(...field.options.map(option => optionElement(option, text)));
    return input;
}

function combobox(
    field: Extract<ReorderableListItemField, { type: "combobox" }>,
    value: unknown,
): ValueControl {
    const input = document.createElement("p9r-combobox") as ValueControl;
    const text = textValue(value);
    input.setAttribute("value", text);
    input.replaceChildren(...field.options.map(option => optionElement(option, text)));
    input.value = text;
    return input;
}

function textValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}
