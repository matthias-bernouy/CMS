import type { WDetailTableColumn } from "../types";
import { isTokenControl, isValueControl, optionElement, type TokenControl, type ValueControl } from "./shared";

export function createTableEditor(column: WDetailTableColumn, value: unknown): HTMLElement {
    if (column.editable !== true) throw new Error("Cannot create an editor for a readonly column");
    const control = column.type === "select"
        ? selectEditor(column, value)
        : column.type === "combobox"
            ? comboboxEditor(column, value)
            : column.type === "tokens"
                ? tokensEditor(value)
                : textEditor(value);
    control.dataset.tableColumn = column.key;
    return control;
}

export function readTableEditor(column: WDetailTableColumn, control: HTMLElement): unknown {
    if (column.editable !== true) return undefined;
    if (column.type === "tokens") return isTokenControl(control) ? [...control.values] : [];
    return isValueControl(control) ? control.value : "";
}

function textEditor(value: unknown): ValueControl {
    const input = document.createElement("p9r-input") as ValueControl;
    const text = textValue(value);
    input.setAttribute("value", text);
    input.value = text;
    return input;
}

function selectEditor(
    column: Extract<WDetailTableColumn, { type: "select" }>,
    value: unknown,
): ValueControl {
    const input = document.createElement("p9r-select") as ValueControl;
    const text = textValue(value);
    input.setAttribute("value", text);
    input.replaceChildren(...column.options.map(option => optionElement(option, text)));
    return input;
}

function comboboxEditor(
    column: Extract<WDetailTableColumn, { type: "combobox" }>,
    value: unknown,
): ValueControl {
    const input = document.createElement("p9r-combobox") as ValueControl;
    const text = textValue(value);
    input.setAttribute("value", text);
    input.replaceChildren(...column.options.map(option => optionElement(option, text)));
    input.value = text;
    return input;
}

function tokensEditor(value: unknown): TokenControl {
    const input = document.createElement("p9r-token-input") as TokenControl;
    const values = Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
    input.setAttribute("value", values.join(","));
    return input;
}

function textValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}
