import type { WDetailField } from "../types";
import { bindFieldControl, optionElement, type TokenControl, type ValueControl } from "./shared";

export function textInput(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-input") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("type", "text");
    input.setAttribute("value", String(field.value));
    applyInputMetadata(input, field);
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

export function numberInput(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-input") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("type", "number");
    input.setAttribute("value", String(field.value));
    for (const attribute of ["min", "max", "step"] as const) {
        const value = field[attribute];
        if (value !== undefined) {
            input.setAttribute(attribute, String(value));
        }
    }
    applyInputMetadata(input, field);
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

export function textarea(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-textarea") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("rows", String(field.rows ?? 4));
    input.setAttribute("value", String(field.value));
    applyInputMetadata(input, field);
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

export function select(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-select") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("value", String(field.value));
    if (field.required) {
        input.setAttribute("required", "");
    }
    input.replaceChildren(...(field.options ?? []).map((option) => optionElement(option, String(field.value))));
    bindFieldControl(input, field);
    return input;
}

export function combobox(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-combobox") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("value", String(field.value));
    input.setAttribute("placeholder", field.placeholder ?? "");
    if (field.required) {
        input.setAttribute("required", "");
    }
    if (field.creatable) {
        input.setAttribute("creatable", "");
    }
    input.replaceChildren(...(field.options ?? []).map((option) => optionElement(option, String(field.value))));
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

export function tokenInput(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-token-input") as TokenControl;
    input.setAttribute("label", field.label);
    input.setAttribute("value", fieldArrayValue(field).join(","));
    input.setAttribute("placeholder", field.placeholder ?? "");
    if (field.required) {
        input.setAttribute("required", "");
    }
    if (field.creatable) {
        input.setAttribute("creatable", "");
    }
    input.replaceChildren(...(field.options ?? []).map((option) => optionElement(option, "")));
    bindFieldControl(input, field);
    return input;
}

function fieldArrayValue(field: WDetailField): string[] {
    if (!Array.isArray(field.value)) {
        return String(field.value)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return field.value.filter((item): item is string => typeof item === "string");
}

function applyInputMetadata(input: HTMLElement, field: WDetailField): void {
    if (field.placeholder) {
        input.setAttribute("placeholder", field.placeholder);
    }
    if (field.required) {
        input.setAttribute("required", "");
    }
}
